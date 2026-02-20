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
            is_active,
            workflow_graph,
            editor_version,
        } = body;
        const graphTriggerNode = workflow_graph?.nodes?.find((n: any) => n?.data?.type?.startsWith?.('trigger_'));
        const graphTriggerType = graphTriggerNode?.data?.type as string | undefined;
        const graphTriggerConfig = (graphTriggerNode?.data?.config || {}) as Record<string, any>;

        // Build update object
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (trigger_config !== undefined) updateData.trigger_config = trigger_config;
        if (comment_reply_config !== undefined) updateData.comment_reply_config = comment_reply_config;
        if (dm_config !== undefined) updateData.dm_config = dm_config;
        if (is_active !== undefined) updateData.is_active = is_active;
        if (workflow_graph !== undefined) updateData.workflow_graph = workflow_graph;
        if (editor_version !== undefined) updateData.editor_version = editor_version;

        // Keep legacy account/post columns in sync for canvas automations.
        if (workflow_graph !== undefined) {
            if (!graphTriggerNode) {
                return NextResponse.json(
                    { error: 'Canvas workflow must include a trigger node' },
                    { status: 400 }
                );
            }

            const resolvedAccountId = graphTriggerConfig.social_account_id as string | undefined;
            if (!resolvedAccountId) {
                return NextResponse.json(
                    { error: 'Canvas trigger must include social_account_id' },
                    { status: 400 }
                );
            }

            const { data: account, error: accountError } = await supabase
                .from('social_accounts')
                .select('id')
                .eq('id', resolvedAccountId)
                .eq('workspace_id', activeWorkspace.id)
                .single();

            if (accountError || !account) {
                return NextResponse.json(
                    { error: 'Invalid social account for this workspace' },
                    { status: 400 }
                );
            }

            updateData.social_account_id = resolvedAccountId;

            if (graphTriggerType === 'trigger_new_comment') {
                if (!graphTriggerConfig.post_id) {
                    return NextResponse.json(
                        { error: 'Comment trigger requires post_id' },
                        { status: 400 }
                    );
                }

                updateData.platform_post_id = graphTriggerConfig.post_id;
                updateData.post_thumbnail_url = graphTriggerConfig.post_thumbnail_url || null;
                updateData.post_caption = graphTriggerConfig.post_caption || null;
            } else {
                updateData.platform_post_id = '__canvas__';
            }
        }

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
