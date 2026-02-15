import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

// POST - Trigger automation processing
// Can be called manually or by an external cron service
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

        // Optional: target a specific automation 
        let automationId: string | null = null;
        try {
            const body = await request.json();
            automationId = body.automation_id || null;
        } catch {
            // No body, process all automations for this workspace
        }

        // Call the Edge Function
        const payload: Record<string, string> = {
            workspace_id: activeWorkspace.id
        };

        if (automationId) {
            payload.automation_id = automationId;
        }

        const { data, error } = await supabase.functions.invoke('process-automations', {
            body: payload
        });

        if (error) {
            console.error('Edge function invocation error:', error);
            return NextResponse.json(
                { error: error.message || 'Failed to process automations' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            ...data
        });

    } catch (error: any) {
        console.error('Process automations API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to process automations' },
            { status: 500 }
        );
    }
}
