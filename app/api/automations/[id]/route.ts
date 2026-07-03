import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation';
import { validateSendEmailNodeConfigs } from '@/lib/automation-send-email-validation';
import type { WorkflowGraph } from '@/types/automation-graph';

interface UpdateAutomationBody {
    name?: string;
    trigger_config?: unknown;
    comment_reply_config?: unknown;
    dm_config?: unknown;
    is_active?: unknown;
    workflow_graph?: WorkflowGraph;
    editor_version?: string;
}

function summarizeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return String(error);
}

function graphConfigValue(config: Record<string, unknown>, key: string): string {
    const value = config[key];
    return typeof value === 'string' ? value : '';
}

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
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read');

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

    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Get automation API error:', error);
        return NextResponse.json(
            { error: summarizeError(error) || 'Failed to fetch automation' },
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
        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write');

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

        assertJsonBodySize(request, 256 * 1024);
        const body = await request.json() as UpdateAutomationBody;
        const {
            name,
            trigger_config,
            comment_reply_config,
            dm_config,
            is_active,
            workflow_graph,
            editor_version,
        } = body;
        const graphTriggerNode = workflow_graph?.nodes?.find((node) => node.data.type.startsWith('trigger_'));
        const graphTriggerType = graphTriggerNode?.data?.type as string | undefined;
        const graphTriggerConfig = (graphTriggerNode?.data?.config || {}) as unknown as Record<string, unknown>;

        // Build update object
        const updateData: Record<string, unknown> = {
            updated_at: new Date().toISOString()
        };

        if (name !== undefined) updateData.name = name;
        if (trigger_config !== undefined) updateData.trigger_config = trigger_config;
        if (comment_reply_config !== undefined) updateData.comment_reply_config = comment_reply_config;
        if (dm_config !== undefined) updateData.dm_config = dm_config;
        if (is_active !== undefined) {
            if (typeof is_active !== 'boolean') {
                return NextResponse.json(
                    { error: 'is_active must be a boolean' },
                    { status: 400 }
                );
            }
            updateData.is_active = is_active;
        }
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

            const sendEmailIssues = validateSendEmailNodeConfigs(workflow_graph);
            if (sendEmailIssues.length > 0) {
                return NextResponse.json(
                    { error: sendEmailIssues[0].message, validationErrors: sendEmailIssues },
                    { status: 400 }
                );
            }

            const resolvedAccountId = graphConfigValue(graphTriggerConfig, 'social_account_id');
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
                const graphPostId = graphConfigValue(graphTriggerConfig, 'post_id');
                if (!graphPostId) {
                    return NextResponse.json(
                        { error: 'Comment trigger requires post_id' },
                        { status: 400 }
                    );
                }

                updateData.platform_post_id = assertMetaGraphNodeId(graphPostId, 'post_id');
                updateData.post_thumbnail_url = graphConfigValue(graphTriggerConfig, 'post_thumbnail_url') || null;
                updateData.post_caption = graphConfigValue(graphTriggerConfig, 'post_caption') || null;
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

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid post_id|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Update automation API error:', error);
        return NextResponse.json(
            { error: summarizeError(error) || 'Failed to update automation' },
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
        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'automation:write');

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

    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Delete automation API error:', error);
        return NextResponse.json(
            { error: summarizeError(error) || 'Failed to delete automation' },
            { status: 500 }
        );
    }
}
