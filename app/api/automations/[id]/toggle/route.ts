import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

function summarizeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return String(error);
}

// POST - Toggle automation active status
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
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

        const body = await request.json() as { is_active?: unknown };
        const { is_active } = body;

        if (typeof is_active !== 'boolean') {
            return NextResponse.json(
                { error: 'is_active must be a boolean' },
                { status: 400 }
            );
        }

        // Verify the automation belongs to this workspace
        const { data: existing, error: existingError } = await supabase
            .from('automations')
            .select('id')
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (existingError || !existing) {
            return NextResponse.json(
                { error: 'Automation not found' },
                { status: 404 }
            );
        }

        const { data: automation, error: updateError } = await supabase
            .from('automations')
            .update({
                is_active,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (updateError) {
            throw updateError;
        }

        return NextResponse.json({
            success: true,
            automation
        });

    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Toggle automation API error:', error);
        return NextResponse.json(
            { error: summarizeError(error) || 'Failed to toggle automation' },
            { status: 500 }
        );
    }
}
