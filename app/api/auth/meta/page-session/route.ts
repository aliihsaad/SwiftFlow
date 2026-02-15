import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

/**
 * GET /api/auth/meta/page-session?sessionId=...
 * 
 * Fetches the temporary page session data for the page selector UI.
 */
export async function GET(request: NextRequest) {
    const sessionId = request.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
        return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 });
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

    // Check expiry
    if (new Date(session.expires_at) < new Date()) {
        await supabaseAdmin.from('oauth_page_sessions').delete().eq('id', sessionId);
        return NextResponse.json(
            { error: 'Session expired. Please start the connection flow again.' },
            { status: 410 }
        );
    }

    // Return pages data WITHOUT access tokens (those stay server-side)
    const safePagesData = (session.pages_data as any[]).map((p: any) => ({
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
}
