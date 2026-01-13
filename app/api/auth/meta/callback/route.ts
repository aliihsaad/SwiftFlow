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

        console.log('Meta OAuth Token Exchange Success:', {
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            granted_scopes: tokenData.scope, // Critical for debugging
            has_token: !!tokenData.access_token,
        });

        // 2. Fetch User's Pages
        // This returns individual page access tokens which are needed for publishing
        const pagesResponse = await fetch(`${META_GRAPH_URL}/me/accounts?access_token=${userAccessToken}`);
        if (!pagesResponse.ok) {
            const errorText = await pagesResponse.text();
            throw new Error(`Failed to fetch Facebook Pages: ${errorText}`);
        }
        const pagesData = await pagesResponse.json();
        const pages = pagesData.data || [];

        console.log(`Fetched ${pages.length} pages for workspace ${workspaceId}`);

        // 3. Enrich with Instagram Business Accounts and Store
        if (pages.length > 0) {
            // Fetch IG details for each page
            const enrichedPages = await Promise.all(pages.map(async (page: any) => {
                try {
                    const igResponse = await fetch(`${META_GRAPH_URL}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
                    if (igResponse.ok) {
                        const igData = await igResponse.json();
                        if (igData.instagram_business_account) {
                            page.instagram_business_account = igData.instagram_business_account;
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to fetch IG account for page ${page.name}`, e);
                }
                return page;
            }));

            // Prepare DB operations
            for (const page of enrichedPages) {
                const metadata: any = {
                    category: page.category,
                    tasks: page.tasks,
                    user_access_token: userAccessToken // Keep user token just in case
                };

                if (page.instagram_business_account) {
                    metadata.instagram_business_account_id = page.instagram_business_account.id;
                }

                // Check if account already exists in this workspace
                const { data: existingAccount } = await supabaseAdmin
                    .from('social_accounts')
                    .select('id')
                    .eq('workspace_id', workspaceId)
                    .eq('account_id', page.id)
                    .single();

                if (existingAccount) {
                    // Update existing account
                    await supabaseAdmin
                        .from('social_accounts')
                        .update({
                            account_name: page.name,
                            access_token: page.access_token,
                            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                            metadata: metadata,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existingAccount.id);
                } else {
                    // Insert new account
                    await supabaseAdmin
                        .from('social_accounts')
                        .insert({
                            workspace_id: workspaceId,
                            platform: 'facebook',
                            account_name: page.name,
                            account_id: page.id,
                            access_token: page.access_token,
                            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                            metadata: metadata
                        });
                }

                // Optional: If IG exists, auto-create an Instagram 'connected account' entry?
                // For now, adhering to instructions to just "store the ID". 
                // It is stored in the Facebook Page's metadata.
            }
        }

        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?success=meta_connected&pages_count=${pages.length}`, request.url)
        );
    } catch (error) {
        console.error('Meta token exchange error:', error);

        const errorMessage = error instanceof Error
            ? error.message
            : 'Token exchange failed';

        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?error=${encodeURIComponent(errorMessage)}&debug=${encodeURIComponent(JSON.stringify(error))}`, request.url)
        );
    }
}
