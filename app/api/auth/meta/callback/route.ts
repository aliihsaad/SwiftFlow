import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/utils/meta-oauth';
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

// Initialize Supabase Admin Client for database operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

/**
 * Meta OAuth Callback Route - COMPLETE REWRITE WITH DEBUGGING
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
        // Step 1: Exchange code for token
        log('Step 1: Exchanging code for token...');
        const tokenData = await exchangeCodeForToken(code);
        log(`Step 1 Full token response keys: ${Object.keys(tokenData).join(', ')}`);
        log(`Step 1 Token type: ${tokenData.token_type}, expires_in: ${tokenData.expires_in}, scope: ${tokenData.scope}`);
        const userAccessToken = tokenData.access_token;

        if (!userAccessToken) {
            log('ERROR: No access token received from Meta');
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=no_access_token', request.url)
            );
        }
        log(`Step 1 SUCCESS: Got token (${userAccessToken.substring(0, 20)}..., expires in ${tokenData.expires_in}s)`);

        // Step 1b: Verify token by calling /me
        log('Step 1b: Verifying token with /me...');
        const meResponse = await fetch(`${META_GRAPH_URL}/me?fields=id,name&access_token=${userAccessToken}`, { cache: 'no-store' });
        const meText = await meResponse.text();
        log(`Step 1b /me response (${meResponse.status}): ${meText.substring(0, 200)}`);

        // Step 1c: Debug token to check type and scopes
        log('Step 1c: Debugging token...');
        const debugResponse = await fetch(`${META_GRAPH_URL}/debug_token?input_token=${userAccessToken}&access_token=${process.env.NEXT_PUBLIC_META_APP_ID}|${process.env.META_APP_SECRET}`, { cache: 'no-store' });
        const debugText = await debugResponse.text();
        log(`Step 1c debug_token response (${debugResponse.status}): ${debugText.substring(0, 500)}`);

        // Step 2: Fetch pages
        log('Step 2: Fetching pages from /me/accounts...');
        const pagesUrl = `${META_GRAPH_URL}/me/accounts?fields=id,name,access_token,category&access_token=${userAccessToken}`;
        log(`Fetching: ${pagesUrl.substring(0, 80)}...`);

        const pagesResponse = await fetch(pagesUrl, { cache: 'no-store' });

        if (!pagesResponse.ok) {
            const errorText = await pagesResponse.text();
            log(`ERROR: Pages fetch failed with status ${pagesResponse.status}`);
            log(`Response: ${errorText.substring(0, 200)}`);
            return NextResponse.redirect(
                new URL(`/dashboard/settings/brand?error=pages_fetch_failed&status=${pagesResponse.status}`, request.url)
            );
        }

        const rawText = await pagesResponse.text();
        log(`Step 2 Raw Response: ${rawText.substring(0, 500)}`);

        let pagesData;
        try {
            pagesData = JSON.parse(rawText);
        } catch (e) {
            log(`ERROR: Failed to parse JSON: ${e}`);
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=json_parse_failed', request.url)
            );
        }

        const pages = pagesData.data || [];
        log(`Step 2 SUCCESS: Found ${pages.length} page(s)`);

        if (pages.length === 0) {
            log('WARNING: No pages returned by Meta API');
            return NextResponse.redirect(
                new URL('/dashboard/settings/brand?error=no_pages&debug=' + encodeURIComponent(debugLog.join('|')), request.url)
            );
        }

        // Step 3: Store each page in database
        log('Step 3: Storing pages in database...');

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            log(`Processing page ${i + 1}/${pages.length}: ${page.name} (ID: ${page.id})`);

            // Check for Instagram
            let igAccountId = null;
            try {
                const igUrl = `${META_GRAPH_URL}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
                log(`  Checking for Instagram at: ${igUrl.substring(0, 100)}...`);

                const igResponse = await fetch(igUrl, { cache: 'no-store' });
                const igRawText = await igResponse.text();
                log(`  Instagram API response (status ${igResponse.status}): ${igRawText.substring(0, 200)}`);

                if (igResponse.ok) {
                    const igData = JSON.parse(igRawText);
                    if (igData.instagram_business_account) {
                        igAccountId = igData.instagram_business_account.id;
                        log(`  SUCCESS: Found Instagram Business Account: ${igAccountId}`);
                    } else {
                        log(`  No instagram_business_account field in response`);
                    }
                } else {
                    log(`  Instagram API failed with status ${igResponse.status}`);
                }
            } catch (e) {
                log(`  Instagram fetch ERROR: ${e}`);
            }

            // Prepare data
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
                    instagram_business_account_id: igAccountId
                }
            };

            // Check if exists
            const { data: existing, error: selectError } = await supabaseAdmin
                .from('social_accounts')
                .select('id')
                .eq('workspace_id', workspaceId)
                .eq('account_id', page.id)
                .maybeSingle(); // Use maybeSingle instead of single to avoid error on no rows

            if (selectError) {
                log(`  ERROR checking existing: ${JSON.stringify(selectError)}`);
            }

            // Insert or Update
            if (existing) {
                log(`  Updating existing record (id: ${existing.id})...`);
                const { error: updateError } = await supabaseAdmin
                    .from('social_accounts')
                    .update({ ...accountData, updated_at: new Date().toISOString() })
                    .eq('id', existing.id);

                if (updateError) {
                    log(`  ERROR updating: ${JSON.stringify(updateError)}`);
                } else {
                    log(`  SUCCESS: Updated ${page.name}`);
                }
            } else {
                log(`  Inserting new record...`);
                const { data: insertData, error: insertError } = await supabaseAdmin
                    .from('social_accounts')
                    .insert(accountData)
                    .select();

                if (insertError) {
                    log(`  ERROR inserting: ${JSON.stringify(insertError)}`);
                } else {
                    log(`  SUCCESS: Inserted ${page.name}, returned: ${JSON.stringify(insertData)}`);
                }
            }

            // Handle Instagram
            if (igAccountId) {
                log(`  Processing Instagram account...`);
                const igAccountData = {
                    workspace_id: workspaceId,
                    platform: 'instagram',
                    account_name: `${page.name} (IG)`,
                    account_id: igAccountId,
                    access_token: page.access_token,
                    token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                    metadata: {
                        connected_page_id: page.id,
                        user_access_token: userAccessToken
                    }
                };

                const { data: existingIg } = await supabaseAdmin
                    .from('social_accounts')
                    .select('id')
                    .eq('workspace_id', workspaceId)
                    .eq('account_id', igAccountId)
                    .maybeSingle();

                if (existingIg) {
                    const { error: igUpdateError } = await supabaseAdmin
                        .from('social_accounts')
                        .update({ ...igAccountData, updated_at: new Date().toISOString() })
                        .eq('id', existingIg.id);
                    if (igUpdateError) log(`  ERROR updating IG: ${JSON.stringify(igUpdateError)}`);
                    else log(`  SUCCESS: Updated IG for ${page.name}`);
                } else {
                    const { error: igInsertError } = await supabaseAdmin
                        .from('social_accounts')
                        .insert(igAccountData);
                    if (igInsertError) log(`  ERROR inserting IG: ${JSON.stringify(igInsertError)}`);
                    else log(`  SUCCESS: Inserted IG for ${page.name}`);
                }
            }
        }

        log('Step 3 COMPLETE: All pages processed');
        log(`Workspace used: ${workspaceId}`);

        // Step 4: Verify records were saved
        const { data: savedAccounts, error: verifyError } = await supabaseAdmin
            .from('social_accounts')
            .select('id, platform, account_name, account_id')
            .eq('workspace_id', workspaceId);

        if (verifyError) {
            log(`VERIFY ERROR: ${JSON.stringify(verifyError)}`);
        } else {
            log(`VERIFY: Found ${savedAccounts?.length || 0} accounts for workspace ${workspaceId}`);
            savedAccounts?.forEach(a => log(`  - ${a.platform}: ${a.account_name} (${a.account_id})`));
        }

        log('=== FULL DEBUG LOG ===');
        debugLog.forEach((l, i) => console.log(`${i + 1}. ${l}`));

        // Revalidate so the brand settings page re-renders with fresh data
        revalidatePath('/dashboard/settings/brand');

        return NextResponse.redirect(
            new URL(`/dashboard/settings/brand?success=pages_connected&count=${pages.length}&workspace=${workspaceId}`, request.url)
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
