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
 * Flow:
 * 1. User authorizes app with basic permissions (email, public_profile)
 * 2. We exchange the code for a user access token
 * 3. We call /me/accounts to get pages the user administers (implicit access)
 * 4. Store pages in database
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    console.log('[META_CALLBACK] Received callback', {
        params: Object.fromEntries(searchParams.entries()),
        timestamp: new Date().toISOString()
    });

    const code = searchParams.get('code');
    const workspaceId = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors
    if (error) {
        console.error('[META_CALLBACK] OAuth error', { error, errorDescription });
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}`, request.url)
        );
    }

    if (!code) {
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_code', request.url)
        );
    }

    if (!workspaceId) {
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=missing_workspace_id', request.url)
        );
    }

    try {
        // 1. Exchange code for User Access Token
        console.log('[META_CALLBACK] Exchanging code for token');
        const tokenData = await exchangeCodeForToken(code);
        const userAccessToken = tokenData.access_token;

        console.log('[META_CALLBACK] Token exchange success', {
            hasToken: !!userAccessToken,
            expiresIn: tokenData.expires_in
        });

        // 2. Fetch pages the user administers (implicit via /me/accounts)
        console.log('[META_CALLBACK] Fetching user pages via /me/accounts');
        const pagesResponse = await fetch(
            `${META_GRAPH_URL}/me/accounts?access_token=${userAccessToken}`
        );

        if (!pagesResponse.ok) {
            const errorText = await pagesResponse.text();
            console.error('[META_CALLBACK] Pages fetch failed', { status: pagesResponse.status, error: errorText });

            // Even if pages fetch fails, the login succeeded
            return NextResponse.redirect(
                new URL(`/dashboard/settings/brand?success=meta_connected&pages_count=0&note=pages_fetch_failed`, request.url)
            );
        }

        const pagesData = await pagesResponse.json();
        const pages = pagesData.data || [];

        console.log('[META_CALLBACK] Pages fetched', {
            count: pages.length,
            pageNames: pages.map((p: any) => p.name)
        });

        // 3. Enrich with Instagram Business Account IDs
        if (pages.length > 0) {
            for (const page of pages) {
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
                    console.warn('[META_CALLBACK] Instagram fetch failed for page', page.name);
                }
            }

            // 4. Store pages in database
            console.log('[META_CALLBACK] Storing pages in database');
            for (const page of pages) {
                const { data: existing } = await supabaseAdmin
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
                        user_access_token: userAccessToken,
                        instagram_business_account_id: page.instagram_business_account?.id
                    }
                };

                if (existing) {
                    await supabaseAdmin
                        .from('social_accounts')
                        .update({ ...accountData, updated_at: new Date().toISOString() })
                        .eq('id', existing.id);
                } else {
                    await supabaseAdmin.from('social_accounts').insert(accountData);
                }
            }

            console.log('[META_CALLBACK] Pages stored successfully');
        }

        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?success=meta_connected&pages_count=${pages.length}`, request.url)
        );

    } catch (error) {
        console.error('[META_CALLBACK] Error', error);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(
                error instanceof Error ? error.message : 'Unknown error'
            )}`, request.url)
        );
    }
}
