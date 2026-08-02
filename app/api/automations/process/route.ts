import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

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
        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write');

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

        // process-automations requires internal (service-role) invocation;
        // auth + automation:write were already enforced above for this user.
        const supabaseAdmin = createAdminClient();
        const { data, error } = await supabaseAdmin.functions.invoke('process-automations', {
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

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to process automations';
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage }, { status: permissionStatus });
        }
        console.error('Process automations API error:', error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
