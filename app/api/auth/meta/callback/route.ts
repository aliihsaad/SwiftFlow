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
 * Handles the redirect from Facebook after user authorizes the app
 * 
 * Modern two-step flow:
 * - 'login' flow: Just authenticate user
 * - 'pages' flow: Fetch and store Facebook Pages + Instagram
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    // Log ALL query parameters for debugging
    console.log('[META_CALLBACK] Received callback', {
        url: request.url,
        params: Object.fromEntries(searchParams.entries()),
        timestamp: new Date().toISOString()
    });

    const code = searchParams.get('code');
    const stateParam = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors from Meta
    if (error) {
        console.error('[META_CALLBACK] OAuth error', {
            error,
            errorDescription,
            errorReason: searchParams.get('error_reason')
        });

        return NextResponse.redirect(
            new URL(
                `/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}`,
                request.url
            )
        );
    }

    // Validate authorization code
    if (!code) {
        console.error('[META_CALLBACK] Missing authorization code');
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_code', request.url)
        );
    }

    // Parse state parameter: format is "workspaceId:flowType" or just "flowType"
    let workspaceId: string | undefined;
    let flowType: 'login' | 'pages' = 'login';

    if (stateParam) {
        if (stateParam.includes(':')) {
            const parts = stateParam.split(':');
            workspaceId = parts[0];
            flowType = parts[1] as 'login' | 'pages';
        } else {
            // Check if it's a UUID (workspace) or flow type
            if (stateParam === 'login' || stateParam === 'pages') {
                flowType = stateParam as 'login' | 'pages';
            } else {
                workspaceId = stateParam;
            }
        }
    }

    console.log('[META_CALLBACK] Flow detection', {
        workspaceId,
        flowType,
        rawState: stateParam
    });

    if (!workspaceId) {
        console.error('[META_CALLBACK] Missing workspace ID');
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_workspace_id', request.url)
        );
    }

    try {
        // Exchange authorization code for access token
        console.log('[META_CALLBACK] Exchanging code for token');
        const tokenData = await exchangeCodeForToken(code);

        console.log('[META_CALLBACK] Token exchange success', {
            flowType,
            hasToken: !!tokenData.access_token,
            expiresIn: tokenData.expires_in
        });

        // Route based on flow type
        if (flowType === 'pages') {
            // === PAGES FLOW ===
            // Fetch Facebook Pages and Instagram accounts
            return await handlePagesFlow(request, workspaceId, tokenData.access_token);
        } else {
            // === LOGIN FLOW ===
            // Just authenticate user (optional: fetch profile)
            return await handleLoginFlow(request, tokenData.access_token);
        }

    } catch (error) {
        console.error('[META_CALLBACK] Error in callback', {
            error: error instanceof Error ? error.message : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
        });

        return NextResponse.redirect(
            new URL(
                `/dashboard/settings/brand?error=${encodeURIComponent(
                    error instanceof Error ? error.message : 'Unknown error'
                )}`,
                request.url
            )
        );
    }
}

/**
 * Handle Pages Flow: Fetch pages and Instagram accounts
 */
async function handlePagesFlow(
    request: NextRequest,
    workspaceId: string,
    accessToken: string
): Promise<NextResponse> {
    console.log('[META_CALLBACK] Handling PAGES flow');

    // Fetch user's Facebook Pages
    const pagesResponse = await fetch(
        `${META_GRAPH_URL}/me/accounts?access_token=${accessToken}`
    );

    console.log('[META_CALLBACK] Pages API response', {
        status: pagesResponse.status,
        ok: pagesResponse.ok
    });

    if (!pagesResponse.ok) {
        const errorText = await pagesResponse.text();
        console.error('[META_CALLBACK] Pages API failed', {
            status: pagesResponse.status,
            error: errorText,
            possibleCauses: [
                'pages permissions not granted',
                'user not Admin/Developer/Tester (Development mode)',
                'user manages no pages',
                'Meta API error'
            ]
        });

        return NextResponse.redirect(
            new URL(
                `/dashboard/settings/brand?error=pages_fetch_failed&details=${encodeURIComponent(errorText)}`,
                request.url
            )
        );
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    console.log('[META_CALLBACK] Pages fetched', {
        count: pages.length,
        pageNames: pages.map((p: any) => p.name)
    });

    // Check if user has no pages
    if (pages.length === 0) {
        console.warn('[META_CALLBACK] No pages found');
        return NextResponse.redirect(
            new URL(
                `/dashboard/settings/brand?error=no_pages&message=${encodeURIComponent(
                    'No Facebook Pages found. Make sure: (1) You manage at least one Facebook Page, (2) Your Facebook account is an Admin/Developer/Tester in the Meta app'
                )}`,
                request.url
            )
        );
    }

    // Enrich pages with Instagram Business Account IDs
    console.log('[META_CALLBACK] Fetching Instagram accounts');
    const enrichedPages = await Promise.all(
        pages.map(async (page: any) => {
            try {
                const igResponse = await fetch(
                    `${META_GRAPH_URL}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
                );

                if (igResponse.ok) {
                    const igData = await igResponse.json();
                    if (igData.instagram_business_account) {
                        page.instagram_business_account = igData.instagram_business_account;
                        console.log('[META_CALLBACK] Found Instagram for page', {
                            pageName: page.name,
                            igId: igData.instagram_business_account.id
                        });
                    }
                }
            } catch (e) {
                console.warn('[META_CALLBACK] Instagram fetch failed', {
                    pageName: page.name
                });
            }
            return page;
        })
    );

    // Store pages in database
    console.log('[META_CALLBACK] Storing pages in database');
    for (const page of enrichedPages) {
        // Check if account already exists
        const { data: existingAccount } = await supabaseAdmin
            .from('social_accounts')
            .select('id')
            .eq('workspace_id', workspaceId)
            .eq('account_id', page.id)
            .single();

        const accountData = {
            workspace_id: workspaceId,
            platform: 'facebook',
            account_name: page.name,
            account_id: page.id,
            access_token: page.access_token,
            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
            metadata: {
                category: page.category,
                tasks: page.tasks,
                user_access_token: accessToken,
                instagram_business_account_id: page.instagram_business_account?.id
            }
        };

        if (existingAccount) {
            await supabaseAdmin
                .from('social_accounts')
                .update({
                    ...accountData,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingAccount.id);
        } else {
            await supabaseAdmin
                .from('social_accounts')
                .insert(accountData);
        }
    }

    console.log('[META_CALLBACK] Pages stored successfully');

    return NextResponse.redirect(
        new URL(
            `/dashboard/settings/brand?success=pages_connected&count=${pages.length}`,
            request.url
        )
    );
}

/**
 * Handle Login Flow: Just authenticate user
 */
async function handleLoginFlow(
    request: NextRequest,
    accessToken: string
): Promise<NextResponse> {
    console.log('[META_CALLBACK] Handling LOGIN flow');

    // Optionally fetch user profile
    try {
        const userResponse = await fetch(
            `${META_GRAPH_URL}/me?fields=id,name,email&access_token=${accessToken}`
        );

        if (userResponse.ok) {
            const user = await userResponse.json();
            console.log('[META_CALLBACK] User authenticated', {
                userId: user.id,
                userName: user.name
            });
        }
    } catch (e) {
        console.warn('[META_CALLBACK] User profile fetch failed (non-critical)');
    }

    return NextResponse.redirect(
        new URL(`/dashboard/settings/brand?success=login_success`, request.url)
    );
}
