import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken, exchangeForLongLivedUserToken } from '@/utils/meta-oauth';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { encryptMetaToken } from '@/lib/meta-account';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { redactSensitiveLogValue, redactSensitiveString } from '@/lib/security/redaction';

const META_OAUTH_STATE_COOKIE = 'meta_oauth_state';
const META_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

// Initialize Supabase Admin Client for database operations
const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

type MetaDebugTokenResponse = {
    data?: {
        scopes?: unknown[];
        granular_scopes?: Array<{
            scope?: unknown;
            target_ids?: unknown[];
        }>;
        expires_at?: unknown;
        is_valid?: unknown;
    };
};

/** Meta reports expires_at=0 for tokens that never expire. */
function parseDebugTokenExpiry(parsed: MetaDebugTokenResponse | null): string | null {
    const raw = parsed?.data?.expires_at;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return null;
    return new Date(raw * 1000).toISOString();
}

function parseDebugTokenScopes(parsedDebugToken: MetaDebugTokenResponse | null): {
    scopes: string[];
    granularScopes: Array<{ scope: string; target_ids?: string[] }>;
} {
    return {
        scopes: Array.isArray(parsedDebugToken?.data?.scopes)
            ? parsedDebugToken.data.scopes.filter((s: unknown) => typeof s === 'string')
            : [],
        granularScopes: Array.isArray(parsedDebugToken?.data?.granular_scopes)
            ? parsedDebugToken.data.granular_scopes
                .filter((s) => typeof s?.scope === 'string')
                .map((s) => ({
                    scope: String(s.scope),
                    target_ids: Array.isArray(s?.target_ids)
                        ? s.target_ids.filter((id: unknown) => typeof id === 'string')
                        : undefined,
                }))
            : [],
    };
}

async function debugMetaTokenScopes(params: {
    inputToken: string;
    appId: string;
    appSecret: string;
}): Promise<{
    status: number;
    scopes: string[];
    granularScopes: Array<{ scope: string; target_ids?: string[] }>;
    parsed: MetaDebugTokenResponse | null;
}> {
    const debugResponse = await fetch(
        `${META_GRAPH_URL}/debug_token?input_token=${params.inputToken}&access_token=${params.appId}|${params.appSecret}`,
        { cache: 'no-store' }
    );
    const debugText = await debugResponse.text();
    let parsed: MetaDebugTokenResponse | null = null;
    try {
        parsed = JSON.parse(debugText);
    } catch {
        parsed = null;
    }

    const parsedScopes = parseDebugTokenScopes(parsed);
    return {
        status: debugResponse.status,
        scopes: parsedScopes.scopes,
        granularScopes: parsedScopes.granularScopes,
        parsed,
    };
}

/**
 * Meta OAuth Callback Route
 * 
 * Exchanges the OAuth code for tokens, fetches all available pages,
 * then redirects to a PAGE SELECTOR so the user picks exactly 1 page
 * (+ its linked Instagram) for this workspace.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const debugLog: string[] = [];
    const clearOAuthStateCookie = (response: NextResponse) => {
        response.cookies.set(META_OAUTH_STATE_COOKIE, '', {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 0,
        });
        return response;
    };
    const redirectWithError = (path: string) => clearOAuthStateCookie(
        NextResponse.redirect(new URL(path, request.url))
    );

    const log = (msg: string) => {
        const safeMessage = redactSensitiveString(msg);
        console.log(`[META_CALLBACK] ${safeMessage}`);
        debugLog.push(safeMessage);
    };

    log(`Callback received at ${new Date().toISOString()}`);

    const code = searchParams.get('code');
    const stateNonce = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
        log(`OAuth error: ${errorDescription || error}`);
        return redirectWithError(`/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}`);
    }

    if (!code) {
        log('Missing code parameter');
        return redirectWithError('/dashboard/settings/brand?error=missing_code');
    }

    if (!stateNonce) {
        log('Missing OAuth state parameter');
        return redirectWithError('/dashboard/settings/brand?error=invalid_oauth_state');
    }

    const stateCookie = request.cookies.get(META_OAUTH_STATE_COOKIE)?.value;
    if (!stateCookie) {
        log('Missing OAuth state cookie');
        return redirectWithError('/dashboard/settings/brand?error=invalid_oauth_state');
    }

    let workspaceId: string | null = null;
    try {
        const parsed = JSON.parse(Buffer.from(stateCookie, 'base64url').toString('utf8')) as {
            nonce?: string;
            workspaceId?: string;
            createdAt?: number;
        };

        const createdAt = Number(parsed.createdAt || 0);
        const isFresh = Number.isFinite(createdAt) && Date.now() - createdAt <= META_OAUTH_STATE_MAX_AGE_MS;
        if (parsed.nonce !== stateNonce || !parsed.workspaceId || !isFresh) {
            throw new Error('OAuth state validation failed');
        }
        workspaceId = parsed.workspaceId;
    } catch (stateError) {
        log(`OAuth state validation failed: ${stateError instanceof Error ? stateError.message : String(stateError)}`);
        return redirectWithError('/dashboard/settings/brand?error=invalid_oauth_state');
    }

    log(`WorkspaceId from state: ${workspaceId}`);

    try {
        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            log('Unauthorized callback: no authenticated user session');
            return redirectWithError('/dashboard/settings/brand?error=unauthorized');
        }

        await requireWorkspacePermission(supabase, user.id, workspaceId, 'integrations:write');

        // Use shared Meta app credentials from environment
        const appId = process.env.NEXT_PUBLIC_META_APP_ID!;
        const appSecret = process.env.META_APP_SECRET!;

        if (!appId || !appSecret) {
            log('ERROR: Missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET env vars');
            return redirectWithError('/dashboard/settings/brand?error=meta_app_not_configured');
        }

        log(`Using shared Meta app (App ID: ${appId.substring(0, 8)}...)`);

        // Step 1: Exchange code for token using shared credentials
        log('Step 1: Exchanging code for token...');
        const tokenData = await exchangeCodeForToken(code);
        log(`Step 1 Token type: ${tokenData.token_type}, expires_in: ${tokenData.expires_in}`);
        const userAccessToken = tokenData.access_token;

        if (!userAccessToken) {
            log('ERROR: No access token received from Meta');
            return redirectWithError('/dashboard/settings/brand?error=no_access_token');
        }
        log(`Step 1 SUCCESS: Got user access token`);

        // Step 1a: Exchange for a long-lived user token. Page tokens fetched
        // with a long-lived user token do not expire; without this exchange
        // every connection dies when the short-lived token does (~hours).
        let effectiveUserToken = userAccessToken;
        try {
            const longLived = await exchangeForLongLivedUserToken(userAccessToken);
            if (longLived.access_token) {
                effectiveUserToken = longLived.access_token;
                log(`Step 1a SUCCESS: Long-lived user token acquired (expires_in: ${longLived.expires_in ?? 'n/a'})`);
            }
        } catch (exchangeError) {
            // Degraded but functional: connections will need the token-health
            // sweep / reconnect flow sooner.
            log(`Step 1a WARNING: Long-lived exchange failed, continuing with short-lived token: ${
                exchangeError instanceof Error ? exchangeError.message : String(exchangeError)
            }`);
        }

        // Step 1b: Debug token to check scopes
        log('Step 1b: Debugging token...');
        let grantedScopes: string[] = [];
        let grantedGranularScopes: Array<{ scope: string; target_ids?: string[] }> = [];
        try {
            const debuggedUserToken = await debugMetaTokenScopes({ inputToken: effectiveUserToken, appId, appSecret });
            log(`Step 1b debug_token status: ${debuggedUserToken.status}`);
            grantedScopes = debuggedUserToken.scopes;
            grantedGranularScopes = debuggedUserToken.granularScopes;
            log(`Step 1b parsed scopes: ${grantedScopes.length} scopes, ${grantedGranularScopes.length} granular scopes`);
        } catch (debugParseError) {
            log(`Step 1b debug_token parse skipped: ${debugParseError}`);
        }

        // Step 2: Fetch pages
        log('Step 2: Fetching pages from /me/accounts...');
        const pagesUrl = `${META_GRAPH_URL}/me/accounts?fields=id,name,access_token,category&access_token=${effectiveUserToken}`;

        const pagesResponse = await fetch(pagesUrl, { cache: 'no-store' });

        if (!pagesResponse.ok) {
            const pagesErrorText = await pagesResponse.text();
            log(`ERROR: Pages fetch failed with status ${pagesResponse.status}`);
            const details = encodeURIComponent(redactSensitiveString(pagesErrorText).slice(0, 500));
            return redirectWithError(`/dashboard/settings/brand?error=pages_fetch_failed&status=${pagesResponse.status}&details=${details}`);
        }

        const rawText = await pagesResponse.text();
        let pagesData;
        try {
            pagesData = JSON.parse(rawText);
        } catch (e) {
            log(`ERROR: Failed to parse JSON: ${e}`);
            return redirectWithError('/dashboard/settings/brand?error=json_parse_failed');
        }

        const pages = pagesData.data || [];
        log(`Step 2: /me/accounts returned ${pages.length} page(s)`);

        // Fallback: if /me/accounts returns empty, extract target page IDs from
        // debug_token's granular_scopes and fetch each page directly.
        if (pages.length === 0) {
            log('Step 2b: /me/accounts empty — trying fallback via debug_token target_ids...');
            try {
                const pageScopedPermissions = new Set([
                    'pages_show_list',
                    'pages_read_engagement',
                    'pages_manage_posts',
                ]);
                const targetIds = Array.from(new Set(
                    grantedGranularScopes
                        .filter((scope) => pageScopedPermissions.has(scope.scope))
                        .flatMap((scope) => scope.target_ids || [])
                        .filter((id): id is string => typeof id === 'string' && id.length > 0)
                ));
                log(`Step 2b: Found ${targetIds.length} target page IDs from page granular scopes: ${targetIds.join(', ')}`);

                for (const pageId of targetIds) {
                    try {
                        const pageUrl = `${META_GRAPH_URL}/${pageId}?fields=id,name,access_token,category&access_token=${effectiveUserToken}`;
                        const pageResp = await fetch(pageUrl, { cache: 'no-store' });
                        if (pageResp.ok) {
                            const pageData = await pageResp.json();
                            if (pageData.id) {
                                pages.push(pageData);
                                log(`Step 2b: Recovered page: ${pageData.name} (${pageData.id})`);
                            }
                        }
                    } catch (pageError) {
                        log(`Step 2b: Error fetching page ${pageId}: ${pageError}`);
                    }
                }
            } catch (fallbackError) {
                log(`Step 2b: Fallback failed: ${fallbackError}`);
            }
        }

        if (pages.length === 0) {
            log('WARNING: No pages returned by Meta API');
            const scopeDetails = encodeURIComponent([
                `scopes=${grantedScopes.join(',') || 'none'}`,
                `granular=${grantedGranularScopes.map((scope) => `${scope.scope}:${(scope.target_ids || []).length}`).join(',') || 'none'}`,
            ].join('; '));
            return redirectWithError(`/dashboard/settings/brand?error=no_pages&details=${scopeDetails}`);
        }

        // Step 3: For each page, check for linked Instagram Business Account
        log('Step 3: Checking for linked Instagram accounts...');
        const pagesWithIg = [];

        for (const page of pages) {
            let igAccountId = null;
            let igUsername = null;
            let pageGrantedScopes = grantedScopes;
            let pageGrantedGranularScopes = grantedGranularScopes;
            let pageTokenExpiresAt: string | null = null;

            try {
                const debuggedPageToken = await debugMetaTokenScopes({
                    inputToken: page.access_token,
                    appId,
                    appSecret,
                });
                if (debuggedPageToken.scopes.length > 0 || debuggedPageToken.granularScopes.length > 0) {
                    pageGrantedScopes = debuggedPageToken.scopes;
                    pageGrantedGranularScopes = debuggedPageToken.granularScopes;
                }
                pageTokenExpiresAt = parseDebugTokenExpiry(debuggedPageToken.parsed);
                log(`  Page "${page.name}": page token debug status ${debuggedPageToken.status}, scopes: ${pageGrantedScopes.join(',') || 'none'}, expires: ${pageTokenExpiresAt || 'never'}`);
            } catch (pageTokenDebugError) {
                log(`  Page "${page.name}": page token debug skipped: ${pageTokenDebugError}`);
            }

            try {
                const igUrl = `${META_GRAPH_URL}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
                const igResponse = await fetch(igUrl, { cache: 'no-store' });

                if (igResponse.ok) {
                    const igData = await igResponse.json();
                    if (igData.instagram_business_account) {
                        igAccountId = igData.instagram_business_account.id;

                        // Fetch IG username for display
                        try {
                            const igProfileUrl = `${META_GRAPH_URL}/${igAccountId}?fields=username&access_token=${page.access_token}`;
                            const igProfileResp = await fetch(igProfileUrl, { cache: 'no-store' });
                            if (igProfileResp.ok) {
                                const igProfile = await igProfileResp.json();
                                igUsername = igProfile.username || null;
                            }
                        } catch { /* ignore */ }

                        log(`  Page "${page.name}": Found IG account ${igAccountId} (@${igUsername})`);
                    }
                }
            } catch (e) {
                log(`  Error checking IG for page ${page.id}: ${e}`);
            }

            pagesWithIg.push({
                id: page.id,
                name: page.name,
                category: page.category || '',
                access_token: encryptMetaToken(page.access_token),
                ig_account_id: igAccountId,
                ig_username: igUsername,
                granted_scopes: pageGrantedScopes,
                granted_granular_scopes: pageGrantedGranularScopes,
                token_expires_at: pageTokenExpiresAt,
            });
        }

        log(`Step 3 COMPLETE: ${pagesWithIg.length} page(s) ready for selection`);

        // Step 4: Store pages data temporarily and redirect to page selector
        // We store in a temporary DB table to avoid exposing tokens in URLs
        const sessionId = crypto.randomUUID();
        const { error: sessionError } = await supabaseAdmin
            .from('oauth_page_sessions')
            .insert({
                id: sessionId,
                workspace_id: workspaceId,
                user_access_token: encryptMetaToken(effectiveUserToken),
                pages_data: pagesWithIg,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
            });

        if (sessionError) {
            log(`ERROR storing page session: ${JSON.stringify(sessionError)}`);
            return redirectWithError('/dashboard/settings/brand?error=session_storage_failed');
        }

        log(`Step 4: Stored page session ${sessionId}, redirecting to selector`);

        // Redirect to page selector UI
        return clearOAuthStateCookie(
            NextResponse.redirect(new URL(`/dashboard/settings/select-page?session=${sessionId}`, request.url))
        );

    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return redirectWithError('/dashboard/settings/brand?error=forbidden');
        }
        const safeErrorMessage = redactSensitiveString(error instanceof Error ? error.message : String(error));
        log(`FATAL ERROR: ${safeErrorMessage}`);
        console.error('[META_CALLBACK] Full error:', redactSensitiveLogValue(error));
        return redirectWithError(`/dashboard/settings/brand?error=${encodeURIComponent(
            error instanceof Error ? safeErrorMessage : 'Unknown error'
        )}`);
    }
}
