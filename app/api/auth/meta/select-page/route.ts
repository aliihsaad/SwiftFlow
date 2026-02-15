import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

/**
 * POST /api/auth/meta/select-page
 * 
 * Receives the user's page selection from the page selector UI.
 * Saves ONLY the selected Facebook page (+ its linked Instagram) to the workspace.
 * Enforces 1 FB page + 1 IG per workspace by deleting existing accounts first.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { sessionId, selectedPageId } = body;

        if (!sessionId || !selectedPageId) {
            return NextResponse.json(
                { error: 'Missing sessionId or selectedPageId' },
                { status: 400 }
            );
        }

        // Step 1: Fetch the session data
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('oauth_page_sessions')
            .select('*')
            .eq('id', sessionId)
            .maybeSingle();

        if (sessionError || !session) {
            console.error('[SELECT_PAGE] Session not found:', sessionError);
            return NextResponse.json(
                { error: 'Session not found or expired. Please reconnect.' },
                { status: 404 }
            );
        }

        // Check expiry
        if (new Date(session.expires_at) < new Date()) {
            // Clean up expired session
            await supabaseAdmin.from('oauth_page_sessions').delete().eq('id', sessionId);
            return NextResponse.json(
                { error: 'Session expired. Please reconnect.' },
                { status: 410 }
            );
        }

        const workspaceId = session.workspace_id;
        const pagesData = session.pages_data as any[];

        // Step 2: Find the selected page
        const selectedPage = pagesData.find((p: any) => p.id === selectedPageId);
        if (!selectedPage) {
            return NextResponse.json(
                { error: 'Selected page not found in session data' },
                { status: 400 }
            );
        }

        console.log(`[SELECT_PAGE] User selected page "${selectedPage.name}" (${selectedPage.id}) for workspace ${workspaceId}`);

        // Step 3: Delete existing Facebook + Instagram accounts for this workspace
        // This enforces the 1 FB page + 1 IG per workspace rule
        const { error: deleteError } = await supabaseAdmin
            .from('social_accounts')
            .delete()
            .eq('workspace_id', workspaceId)
            .in('platform', ['facebook', 'instagram']);

        if (deleteError) {
            console.error('[SELECT_PAGE] Error deleting existing accounts:', deleteError);
            return NextResponse.json(
                { error: 'Failed to remove existing accounts' },
                { status: 500 }
            );
        }

        // Step 4: Insert the selected Facebook page
        const fbAccountData = {
            workspace_id: workspaceId,
            platform: 'facebook',
            account_name: selectedPage.name,
            account_id: selectedPage.id,
            access_token: selectedPage.access_token,
            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // ~60 days
            metadata: {
                category: selectedPage.category,
                user_access_token: session.user_access_token,
                instagram_business_account_id: selectedPage.ig_account_id,
            },
        };

        const { error: fbInsertError } = await supabaseAdmin
            .from('social_accounts')
            .insert(fbAccountData);

        if (fbInsertError) {
            console.error('[SELECT_PAGE] Error inserting Facebook page:', fbInsertError);
            return NextResponse.json(
                { error: 'Failed to save Facebook page' },
                { status: 500 }
            );
        }

        console.log(`[SELECT_PAGE] Saved Facebook page: ${selectedPage.name}`);

        // Step 5: If the page has a linked Instagram, insert that too
        if (selectedPage.ig_account_id) {
            const igAccountData = {
                workspace_id: workspaceId,
                platform: 'instagram',
                account_name: selectedPage.ig_username
                    ? `@${selectedPage.ig_username}`
                    : `${selectedPage.name} (Instagram)`,
                account_id: selectedPage.ig_account_id,
                access_token: selectedPage.access_token, // IG uses the parent page's token
                token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                metadata: {
                    connected_page_id: selectedPage.id,
                    ig_username: selectedPage.ig_username,
                    user_access_token: session.user_access_token,
                },
            };

            const { error: igInsertError } = await supabaseAdmin
                .from('social_accounts')
                .insert(igAccountData);

            if (igInsertError) {
                console.error('[SELECT_PAGE] Error inserting Instagram account:', igInsertError);
                // Don't fail the whole operation, FB page is already saved
            } else {
                console.log(`[SELECT_PAGE] Saved Instagram account: @${selectedPage.ig_username || selectedPage.ig_account_id}`);
            }
        }

        // Step 6: Update tokens for the same page in other workspaces (token freshness)
        // When the same page is connected to multiple workspaces via the same Meta app,
        // the latest token should be used everywhere
        const { data: otherAccounts } = await supabaseAdmin
            .from('social_accounts')
            .select('id, workspace_id')
            .eq('account_id', selectedPage.id)
            .eq('platform', 'facebook')
            .neq('workspace_id', workspaceId);

        if (otherAccounts && otherAccounts.length > 0) {
            console.log(`[SELECT_PAGE] Updating token for ${otherAccounts.length} other workspace(s) with same page`);
            for (const other of otherAccounts) {
                await supabaseAdmin
                    .from('social_accounts')
                    .update({
                        access_token: selectedPage.access_token,
                        token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', other.id);

                // Also update linked IG in that workspace if it exists
                if (selectedPage.ig_account_id) {
                    await supabaseAdmin
                        .from('social_accounts')
                        .update({
                            access_token: selectedPage.access_token,
                            token_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
                            updated_at: new Date().toISOString(),
                        })
                        .eq('workspace_id', other.workspace_id)
                        .eq('platform', 'instagram')
                        .eq('account_id', selectedPage.ig_account_id);
                }
            }
        }

        // Step 7: Clean up the session
        await supabaseAdmin.from('oauth_page_sessions').delete().eq('id', sessionId);

        return NextResponse.json({
            success: true,
            facebook: { name: selectedPage.name, id: selectedPage.id },
            instagram: selectedPage.ig_account_id
                ? { id: selectedPage.ig_account_id, username: selectedPage.ig_username }
                : null,
        });

    } catch (error) {
        console.error('[SELECT_PAGE] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
