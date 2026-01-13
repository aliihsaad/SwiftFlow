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
 * Flow:
 * 1. User authorizes app on Facebook
 * 2. Facebook redirects here with ?code=xxx and &state=workspace_id
 * 3. Exchange code for access token
 * 4. Fetch User's Pages to get Page Access Tokens
 * 5. Store pages in `social_accounts` table
 * 6. Redirect to success page
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const workspaceId = searchParams.get('state'); // Workspace ID passed as state
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors (user denied, etc.)
    if (error) {
        console.error('Meta OAuth error:', error, errorDescription);
        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(errorDescription || error)}`, request.url)
        );
    }

    // Validate authorization code
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
        const tokenData = await exchangeCodeForToken(code);
        const userAccessToken = tokenData.access_token;

        // 2. Fetch User's Pages
        // This returns individual page access tokens which are needed for publishing
        const pagesResponse = await fetch(`${META_GRAPH_URL}/me/accounts?access_token=${userAccessToken}`);
        if (!pagesResponse.ok) {
            throw new Error('Failed to fetch Facebook Pages');
        }
        const pagesData = await pagesResponse.json();
        const pages = pagesData.data || [];

        console.log(`Fetched ${pages.length} pages for workspace ${workspaceId}`);

        // 3. Store Pages in Database
        if (pages.length > 0) {
            const upsertData = pages.map((page: any) => ({
                workspace_id: workspaceId,
                platform: 'facebook',
                account_name: page.name,
                account_id: page.id,
                access_token: page.access_token, // Page Access Token
                token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // ~60 days default for long-lived
                metadata: {
                    category: page.category,
                    tasks: page.tasks,
                    user_access_token: userAccessToken // Keep user token just in case
                }
            }));

            const { error: dbError } = await supabaseAdmin
                .from('social_accounts')
                .upsert(upsertData, {
                    onConflict: 'workspace_id,account_id', // Needs Unique constraint on (workspace_id, account_id) or just ID check if we had it
                    ignoreDuplicates: false
                });

            // Note: social_accounts schema uses ID as PK. 
            // Better to delete existing for this platform or check if we can add unique constraint.
            // For now, let's query existing to update or insert.

            // Simpler approach for now: Loop and Upsert based on query logic or just insert
            // Since we don't have a unique constraint on (workspace_id, account_id) in the schema provided earlier,
            // we should technically query first. But to keep it efficient:

            for (const page of pages) {
                // Check if exists
                const { data: existing } = await supabaseAdmin
                    .from('social_accounts')
                    .select('id')
                    .eq('workspace_id', workspaceId)
                    .eq('account_id', page.id)
                    .single();

                if (existing) {
                    await supabaseAdmin
                        .from('social_accounts')
                        .update({
                            account_name: page.name,
                            access_token: page.access_token,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                } else {
                    await supabaseAdmin
                        .from('social_accounts')
                        .insert({
                            workspace_id: workspaceId,
                            platform: 'facebook',
                            account_name: page.name,
                            account_id: page.id,
                            access_token: page.access_token,
                            metadata: { category: page.category }
                        });
                }
            }
        }

        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?success=meta_connected', request.url)
        );
    } catch (error) {
        console.error('Meta token exchange error:', error);

        const errorMessage = error instanceof Error
            ? error.message
            : 'Token exchange failed';

        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(errorMessage)}`, request.url)
        );
    }
}
