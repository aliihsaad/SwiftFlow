import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

interface PageData {
    id: string;
    name: string;
    category: string;
    access_token: string;
    ig_account_id: string | null;
    ig_username: string | null;
    granted_scopes?: string[];
    granted_granular_scopes?: Array<{ scope: string; target_ids?: string[] }>;
}

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
        const pagesData = session.pages_data as PageData[];

        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await requireWorkspacePermission(supabase, user.id, workspaceId, 'integrations:write');

        // Step 2: Find the selected page
        const selectedPage = pagesData.find((p) => p.id === selectedPageId);
        if (!selectedPage) {
            return NextResponse.json(
                { error: 'Selected page not found in session data' },
                { status: 400 }
            );
        }

        const grantedScopes = Array.isArray(selectedPage.granted_scopes)
            ? selectedPage.granted_scopes.filter((s) => typeof s === 'string')
            : [];
        const grantedGranularScopes = Array.isArray(selectedPage.granted_granular_scopes)
            ? selectedPage.granted_granular_scopes
                .filter((s: any) => typeof s?.scope === 'string')
                .map((s: any) => ({
                    scope: s.scope,
                    target_ids: Array.isArray(s?.target_ids) ? s.target_ids.filter((id: any) => typeof id === 'string') : undefined,
                }))
            : [];

        console.log(`[SELECT_PAGE] User selected page "${selectedPage.name}" (${selectedPage.id}) for workspace ${workspaceId}`);

        // Step 3: Check if this page (or its IG account) is already connected in another workspace
        const { data: existingFb } = await supabaseAdmin
            .from('social_accounts')
            .select('id, workspace_id')
            .eq('platform', 'facebook')
            .eq('account_id', selectedPage.id)
            .neq('workspace_id', workspaceId)
            .maybeSingle();

        if (existingFb) {
            console.error(`[SELECT_PAGE] Page ${selectedPage.id} already connected in workspace ${existingFb.workspace_id}`);
            return NextResponse.json(
                { error: 'This Facebook page is already connected in another workspace. Disconnect it there first.' },
                { status: 409 }
            );
        }

        if (selectedPage.ig_account_id) {
            const { data: existingIg } = await supabaseAdmin
                .from('social_accounts')
                .select('id, workspace_id')
                .eq('platform', 'instagram')
                .eq('account_id', selectedPage.ig_account_id)
                .neq('workspace_id', workspaceId)
                .maybeSingle();

            if (existingIg) {
                console.error(`[SELECT_PAGE] IG account ${selectedPage.ig_account_id} already connected in workspace ${existingIg.workspace_id}`);
                return NextResponse.json(
                    { error: 'This Instagram account is already connected in another workspace. Disconnect it there first.' },
                    { status: 409 }
                );
            }
        }

        // Step 4: Delete existing Facebook + Instagram accounts for this workspace
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

        // Step 5: Insert the selected Facebook page
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
                granted_scopes: grantedScopes,
                granted_granular_scopes: grantedGranularScopes,
                scopes_checked_at: new Date().toISOString(),
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

        // Step 6: If the page has a linked Instagram, insert that too
        let igInserted = false;
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
                    granted_scopes: grantedScopes,
                    granted_granular_scopes: grantedGranularScopes,
                    scopes_checked_at: new Date().toISOString(),
                },
            };

            const { error: igInsertError } = await supabaseAdmin
                .from('social_accounts')
                .insert(igAccountData);

            if (igInsertError) {
                // Unique constraint violation — IG is already connected elsewhere
                if (igInsertError.code === '23505') {
                    // Roll back the FB insert since they're a pair
                    await supabaseAdmin.from('social_accounts').delete()
                        .eq('workspace_id', workspaceId).eq('platform', 'facebook');
                    return NextResponse.json(
                        { error: 'This Instagram account is already connected in another workspace. Disconnect it there first.' },
                        { status: 409 }
                    );
                }
                console.error('[SELECT_PAGE] Error inserting Instagram account:', igInsertError);
                // Non-conflict error — FB is saved but IG failed
            } else {
                igInserted = true;
                console.log(`[SELECT_PAGE] Saved Instagram account: @${selectedPage.ig_username || selectedPage.ig_account_id}`);
            }
        }

        // Step 7: Clean up the session
        await supabaseAdmin.from('oauth_page_sessions').delete().eq('id', sessionId);

        return NextResponse.json({
            success: true,
            facebook: { name: selectedPage.name, id: selectedPage.id },
            instagram: igInserted && selectedPage.ig_account_id
                ? { id: selectedPage.ig_account_id, username: selectedPage.ig_username }
                : null,
        });

    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[SELECT_PAGE] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
