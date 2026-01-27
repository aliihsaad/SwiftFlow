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

        // Call the sync-analytics Edge Function
        const functionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/sync-analytics`;
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
            },
            body: JSON.stringify({
                workspaceId: activeWorkspace.id
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to sync analytics');
        }

        const result = await response.json();

        return NextResponse.json({
            success: true,
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
