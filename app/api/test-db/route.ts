import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json({ error: 'Missing workspaceId' }, { status: 400 });
    }

    try {
        console.log('[DEBUG_DB] Attempting write test for workspace:', workspaceId);

        // 1. Try to read (Simple check)
        const { data: readData, error: readError } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', workspaceId);

        if (readError) {
            console.error('[DEBUG_DB] Read failed:', readError);
            return NextResponse.json({ step: 'read', error: readError }, { status: 500 });
        }

        // 2. Try to insert a DUMMY row
        const dummyData = {
            workspace_id: workspaceId,
            platform: 'test_platform_' + Date.now(),
            account_name: 'Debug Test Account',
            account_id: 'test_id_' + Date.now(),
            access_token: 'test_token',
            token_expires_at: new Date().toISOString(),
            metadata: { test: true }
        };

        const { data: insertData, error: insertError } = await supabaseAdmin
            .from('social_accounts')
            .insert(dummyData)
            .select();

        if (insertError) {
            console.error('[DEBUG_DB] Insert failed:', insertError);
            return NextResponse.json({ step: 'insert', error: insertError }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Database write successful!',
            readCount: readData?.length,
            inserted: insertData
        });

    } catch (e: any) {
        console.error('[DEBUG_DB] Exception:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
