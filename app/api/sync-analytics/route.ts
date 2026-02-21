import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active workspace
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceKey) {
            return NextResponse.json({ error: 'Missing Supabase service key' }, { status: 500 });
        }

        // Call the sync-analytics Edge Function
        const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-analytics`;
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`
            },
            body: JSON.stringify({
                workspaceId: activeWorkspace.id
            })
        });

        const raw = await response.text();
        let result: any = {};
        try {
            result = raw ? JSON.parse(raw) : {};
        } catch {
            result = { error: raw };
        }
        if (!response.ok) {
            throw new Error(result?.error || 'Failed to sync analytics');
        }

        return NextResponse.json({
            success: true,
            workspaceId: activeWorkspace.id,
            ...result
        });

    } catch (error: any) {
        console.error('Sync analytics API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to sync analytics' },
            { status: 500 }
        );
    }
}
