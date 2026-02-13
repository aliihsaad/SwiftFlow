import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

// GET - Get a single automation
export async function GET(
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
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const { data: automation, error } = await supabase
            .from('automations')
            .select('*')
            .eq('id', id)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (error || !automation) {
            return NextResponse.json(
                { error: 'Automation not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({ automation });

    } catch (error: any) {
        console.error('Get automation API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch automation' },
            { status: 500 }
        );
    }
}

// PUT - Update an automation
export async function PUT(
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
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
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

        const body = await request.json();
        const {
            name,
            trigger_config,
            comment_reply_config,
            dm_config,
            is_active
        } = body;

        // Build update object
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (trigger_config !== undefined) updateData.trigger_config = trigger_config;
        if (comment_reply_config !== undefined) updateData.comment_reply_config = comment_reply_config;
        if (dm_config !== undefined) updateData.dm_config = dm_config;
        if (is_active !== undefined) updateData.is_active = is_active;

        const { data: automation, error: updateError } = await supabase
            .from('automations')
            .update(updateData)
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

    } catch (error: any) {
        console.error('Update automation API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update automation' },
            { status: 500 }
        );
    }
}

// DELETE - Delete an automation
export async function DELETE(
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
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
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

        const { error: deleteError } = await supabase
            .from('automations')
            .delete()
            .eq('id', id);

        if (deleteError) {
            throw deleteError;
        }

        return NextResponse.json({
            success: true
        });

    } catch (error: any) {
        console.error('Delete automation API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete automation' },
            { status: 500 }
        );
    }
}
