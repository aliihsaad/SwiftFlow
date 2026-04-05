import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { sanitizeMetaPageSessionData, sanitizeMetaPageSessionId } from '@/lib/security/phase1-validation';

const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

/**
 * GET /api/auth/meta/page-session?sessionId=...
 * 
 * Fetches the temporary page session data for the page selector UI.
 */
export async function GET(request: NextRequest) {
    try {
        const sessionId = sanitizeMetaPageSessionId(request.nextUrl.searchParams.get('sessionId'));

        const supabase = await createServerClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: session, error } = await supabaseAdmin
            .from('oauth_page_sessions')
            .select('workspace_id, pages_data, expires_at')
            .eq('id', sessionId)
            .maybeSingle();

        if (error || !session) {
            return NextResponse.json(
                { error: 'Session not found. Please start the connection flow again.' },
                { status: 404 }
            );
        }

        await requireWorkspacePermission(supabase, user.id, session.workspace_id, 'integrations:write');

        // Check expiry
        if (new Date(session.expires_at) < new Date()) {
            await supabaseAdmin.from('oauth_page_sessions').delete().eq('id', sessionId);
            return NextResponse.json(
                { error: 'Session expired. Please start the connection flow again.' },
                { status: 410 }
            );
        }

        // Return pages data WITHOUT access tokens (those stay server-side)
        const safePagesData = sanitizeMetaPageSessionData(session.pages_data).map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            ig_account_id: p.ig_account_id,
            ig_username: p.ig_username,
            // access_token intentionally EXCLUDED — stays server-side only
        }));

        return NextResponse.json({
            workspace_id: session.workspace_id,
            pages_data: safePagesData,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid sessionId') {
            return NextResponse.json({ error: 'Missing or invalid sessionId' }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[META_PAGE_SESSION] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
