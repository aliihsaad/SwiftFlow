import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/utils/meta-oauth';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client for database operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

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

    const log = (msg: string) => {
        console.log(`[META_CALLBACK] ${msg}`);
        debugLog.push(msg);
    };

    log(`Callback received at ${new Date().toISOString()}`);

    const code = searchParams.get('code');
    const workspaceId = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
        log(`OAuth error: ${errorDescription || error}`);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}`, request.url)
        );
    }

    if (!code) {
        log('Missing code parameter');
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_code', request.url)
        );
    }

    if (!workspaceId) {
        log('Missing workspaceId (state) parameter');
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_workspace_id', request.url)
        );
    }

    log(`Code: ${code.substring(0, 20)}...`);
    log(`WorkspaceId from state: ${workspaceId}`);

    try {
        // Use shared Meta app credentials from environment
        const appId = process.env.NEXT_PUBLIC_META_APP_ID!;
        const appSecret = process.env.META_APP_SECRET!;

        if (!appId || !appSecret) {
            log('ERROR: Missing NEXT_PUBLIC_META_APP_ID or META_APP_SECRET env vars');
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=meta_app_not_configured', request.url)
            );
        }

        log(`Using shared Meta app (App ID: ${appId.substring(0, 8)}...)`);

        // Step 1: Exchange code for token using shared credentials
        log('Step 1: Exchanging code for token...');
        const tokenData = await exchangeCodeForToken(code);
        log(`Step 1 Token type: ${tokenData.token_type}, expires_in: ${tokenData.expires_in}`);
        const userAccessToken = tokenData.access_token;

        if (!userAccessToken) {
            log('ERROR: No access token received from Meta');
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=no_access_token', request.url)
            );
        }
        log(`Step 1 SUCCESS: Got user access token`);

        // Step 1b: Debug token to check scopes
        log('Step 1b: Debugging token...');
        const debugResponse = await fetch(`${META_GRAPH_URL}/debug_token?input_token=${userAccessToken}&access_token=${appId}|${appSecret}`, { cache: 'no-store' });
        const debugText = await debugResponse.text();
        log(`Step 1b debug_token response (${debugResponse.status}): ${debugText.substring(0, 500)}`);
        let parsedDebugToken: any = null;
        let grantedScopes: string[] = [];
        let grantedGranularScopes: Array<{ scope: string; target_ids?: string[] }> = [];
        try {
            parsedDebugToken = JSON.parse(debugText);
            grantedScopes = Array.isArray(parsedDebugToken?.data?.scopes)
                ? parsedDebugToken.data.scopes.filter((s: unknown) => typeof s === 'string')
                : [];
            grantedGranularScopes = Array.isArray(parsedDebugToken?.data?.granular_scopes)
                ? parsedDebugToken.data.granular_scopes
                    .filter((s: any) => typeof s?.scope === 'string')
                    .map((s: any) => ({
                        scope: s.scope,
                        target_ids: Array.isArray(s?.target_ids)
                            ? s.target_ids.filter((id: unknown) => typeof id === 'string')
                            : undefined,
                    }))
                : [];
            log(`Step 1b parsed scopes: ${grantedScopes.length} scopes, ${grantedGranularScopes.length} granular scopes`);
        } catch (debugParseError) {
            log(`Step 1b debug_token parse skipped: ${debugParseError}`);
        }

        // Step 2: Fetch pages
        log('Step 2: Fetching pages from /me/accounts...');
        const pagesUrl = `${META_GRAPH_URL}/me/accounts?fields=id,name,access_token,category&access_token=${userAccessToken}`;

        const pagesResponse = await fetch(pagesUrl, { cache: 'no-store' });

        if (!pagesResponse.ok) {
            const errorText = await pagesResponse.text();
            log(`ERROR: Pages fetch failed with status ${pagesResponse.status}`);
            return NextResponse.redirect(
                new URL(`/dashboard/settings/brand?error=pages_fetch_failed&status=${pagesResponse.status}`, request.url)
            );
        }

        const rawText = await pagesResponse.text();
        let pagesData;
        try {
            pagesData = JSON.parse(rawText);
        } catch (e) {
            log(`ERROR: Failed to parse JSON: ${e}`);
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=json_parse_failed', request.url)
            );
        }

        let pages = pagesData.data || [];
        log(`Step 2: /me/accounts returned ${pages.length} page(s)`);

        // Fallback: if /me/accounts returns empty, extract target page IDs from
        // debug_token's granular_scopes and fetch each page directly.
        if (pages.length === 0) {
            log('Step 2b: /me/accounts empty — trying fallback via debug_token target_ids...');
            try {
                const granularScopes = parsedDebugToken?.data?.granular_scopes || [];
                const pagesScope = granularScopes.find((s: any) => s.scope === 'pages_show_list');
                const targetIds: string[] = pagesScope?.target_ids || [];
                log(`Step 2b: Found ${targetIds.length} target page IDs: ${targetIds.join(', ')}`);

                for (const pageId of targetIds) {
                    try {
                        const pageUrl = `${META_GRAPH_URL}/${pageId}?fields=id,name,access_token,category&access_token=${userAccessToken}`;
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
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=no_pages', request.url)
            );
        }

        // Step 3: For each page, check for linked Instagram Business Account
        log('Step 3: Checking for linked Instagram accounts...');
        const pagesWithIg = [];

        for (const page of pages) {
            let igAccountId = null;
            let igUsername = null;

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
                access_token: page.access_token,
                ig_account_id: igAccountId,
                ig_username: igUsername,
                granted_scopes: grantedScopes,
                granted_granular_scopes: grantedGranularScopes,
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
                user_access_token: userAccessToken,
                pages_data: pagesWithIg,
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min expiry
            });

        if (sessionError) {
            log(`ERROR storing page session: ${JSON.stringify(sessionError)}`);
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=session_storage_failed', request.url)
            );
        }

        log(`Step 4: Stored page session ${sessionId}, redirecting to selector`);

        // Redirect to page selector UI
        return NextResponse.redirect(
            new URL(`/dashboard/settings/select-page?session=${sessionId}`, request.url)
        );

    } catch (error) {
        log(`FATAL ERROR: ${error instanceof Error ? error.message : String(error)}`);
        console.error('[META_CALLBACK] Full error:', error);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(
                error instanceof Error ? error.message : 'Unknown error'
            )}`, request.url)
        );
    }
}
