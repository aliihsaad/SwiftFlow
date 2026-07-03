import { NextRequest, NextResponse } from 'next/server';
import { canManageMessagesWithMetaAccount, canReadCommentsWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation';
import { validateSendEmailNodeConfigs } from '@/lib/automation-send-email-validation';
import { gateWorkspaceLimit } from '@/lib/billing/gate';
import { createAdminClient } from '@/utils/supabase/admin';
import type { WorkflowGraph } from '@/types/automation-graph';

interface CreateAutomationBody {
    social_account_id?: string;
    name?: string;
    platform_post_id?: string;
    post_thumbnail_url?: string;
    post_caption?: string;
    trigger_config?: unknown;
    comment_reply_config?: unknown;
    dm_config?: unknown;
    workflow_graph?: WorkflowGraph;
    editor_version?: string;
    is_active?: unknown;
}

function summarizeError(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
        return (error as { message: string }).message;
    }
    return String(error);
}

function errorDetail(error: unknown): unknown {
    if (!error || typeof error !== 'object') return null;
    const maybeError = error as { details?: unknown; hint?: unknown; code?: unknown };
    return maybeError.details || maybeError.hint || maybeError.code || null;
}

function graphConfigValue(config: Record<string, unknown>, key: string): string {
    const value = config[key];
    return typeof value === 'string' ? value : '';
}

function graphKeywords(config: Record<string, unknown>): string[] {
    const value = config.keywords;
    return Array.isArray(value) ? value.filter((keyword): keyword is string => typeof keyword === 'string') : [];
}

// GET - List all automations for the workspace
export async function GET() {
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
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read');

        const { data: automations, error } = await supabase
            .from('automations')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        // Get runtime stats per automation.
        // Wizard automations use legacy automation_logs.
        // Canvas automations use automation_runs + persisted counters on automations.
        const automationsWithStats = await Promise.all(
            (automations || []).map(async (automation) => {
                const isCanvas = automation.editor_version === 'canvas' && !!automation.workflow_graph;

                if (isCanvas) {
                    const { count: totalRuns, error: runsCountError } = await supabase
                        .from('automation_runs')
                        .select('*', { count: 'exact', head: true })
                        .eq('automation_id', automation.id);

                    if (runsCountError) {
                        console.error('Failed to count automation_runs for canvas automation:', {
                            automationId: automation.id,
                            error: runsCountError,
                        });
                    }

                    return {
                        ...automation,
                        // The UI currently labels this as "runs", so use automation_runs count.
                        total_triggered: totalRuns ?? 0,
                        // Canvas workers maintain this counter on the automations table.
                        total_dms_sent: automation.total_dms_sent || 0,
                    };
                }

                const { count: totalTriggered } = await supabase
                    .from('automation_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('automation_id', automation.id);

                const { count: totalDmsSent } = await supabase
                    .from('automation_logs')
                    .select('*', { count: 'exact', head: true })
                    .eq('automation_id', automation.id)
                    .eq('dm_sent', true);

                return {
                    ...automation,
                    total_triggered: totalTriggered || 0,
                    total_dms_sent: totalDmsSent || 0
                };
            })
        );

        return NextResponse.json({
            automations: automationsWithStats
        });

    } catch (error: unknown) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Get automations API error:', error);
        console.error(`Get automations API details: ${summarizeError(error)}`);
        return NextResponse.json(
            {
                error: summarizeError(error) || 'Failed to fetch automations',
                details: errorDetail(error)
            },
            { status: 500 }
        );
    }
}

// POST - Create a new automation
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

        // Plan quota gate (no-op unless BILLING_ENFORCEMENT_MODE is log/enforce).
        const quotaGate = await gateWorkspaceLimit(activeWorkspace.id, 'active_automations', async () => {
            const { count } = await createAdminClient()
                .from('automations')
                .select('id', { count: 'exact', head: true })
                .eq('workspace_id', activeWorkspace.id)
                .eq('is_active', true);
            return count ?? 0;
        });
        if (quotaGate) return quotaGate;

        assertJsonBodySize(request, 256 * 1024);
        const body = await request.json() as CreateAutomationBody;
        const {
            social_account_id,
            name,
            platform_post_id,
            post_thumbnail_url,
            post_caption,
            trigger_config,
            comment_reply_config,
            dm_config,
            workflow_graph,
            editor_version,
            is_active,
        } = body;

        // Graph-backed mode: workflow_graph is the primary payload for canvas and new wizard drafts.
        const isGraphBackedMode = editor_version === 'canvas' || !!workflow_graph;
        const isCanvasMode = isGraphBackedMode;
        const shouldStoreCanvasEditor = editor_version === 'canvas';
        const requestedIsActive = typeof is_active === 'boolean' ? is_active : true;
        const graphTriggerNode = workflow_graph?.nodes?.find((node) => node.data.type.startsWith('trigger_'));
        const graphTriggerType = graphTriggerNode?.data?.type as string | undefined;
        const graphTriggerConfig = (graphTriggerNode?.data?.config || {}) as Record<string, unknown>;
        const graphPostId = graphConfigValue(graphTriggerConfig, 'post_id');
        const graphTriggerConfigType = graphConfigValue(graphTriggerConfig, 'trigger_type') === 'keywords'
            ? 'keywords'
            : 'any_comment';
        const graphTriggerKeywords = graphKeywords(graphTriggerConfig);

        // Validation: wizard mode requires legacy fields, canvas mode requires graph
        if (isCanvasMode) {
            if (!workflow_graph || !name) {
                return NextResponse.json(
                    { error: 'Canvas mode requires name and workflow_graph' },
                    { status: 400 }
                );
            }
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
        } else if (!social_account_id || !name || !platform_post_id || !dm_config) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }
        const validatedPlatformPostId = !isCanvasMode ? assertMetaGraphNodeId(platform_post_id, 'platform_post_id') : null;

        // Resolve social_account_id: from body or from graph trigger node
        const resolvedAccountId = social_account_id ||
            workflow_graph?.nodes?.map((node) => node.data.config as unknown as Record<string, unknown>)
                .find((config) => typeof config.social_account_id === 'string')
                ?.social_account_id as string | undefined;

        if (isCanvasMode && !resolvedAccountId) {
            return NextResponse.json(
                { error: 'Canvas trigger must include social_account_id' },
                { status: 400 }
            );
        }

        // Verify the social account belongs to this workspace
        let account: { id: string; access_token: string | null; platform?: string; metadata?: Record<string, unknown> | null } | null = null;
        if (resolvedAccountId) {
            const { data: acc, error: accountError } = await supabase
                .from('social_accounts')
                .select('id, access_token, platform, metadata')
                .eq('id', resolvedAccountId)
                .eq('workspace_id', activeWorkspace.id)
                .single();

            if (accountError || !acc) {
                return NextResponse.json(
                    { error: 'Invalid social account' },
                    { status: 400 }
                );
            }
            account = decryptMetaAccountRow(acc);
        } else if (!isCanvasMode) {
            return NextResponse.json(
                { error: 'Missing social account' },
                { status: 400 }
            );
        }

        if (account && !isCanvasMode) {
            const accountPlatform = account.platform === 'facebook' ? 'facebook' : 'instagram';

            if (!canReadCommentsWithMetaAccount(account.metadata, accountPlatform)) {
                return NextResponse.json(
                    {
                        error: 'Comment-trigger automation is not available for this connected account',
                        errorCode: 'meta_missing_permission',
                        missingPermissions: accountPlatform === 'facebook'
                            ? ['pages_read_engagement']
                            : ['instagram_manage_comments'],
                        requiresReconnect: false,
                    },
                    { status: 403 }
                );
            }

            if (!canManageMessagesWithMetaAccount(account.metadata, accountPlatform)) {
                return NextResponse.json(
                    {
                        error: 'DM automation is not available for this connected account',
                        errorCode: 'meta_missing_permission',
                        missingPermissions: accountPlatform === 'facebook'
                            ? ['pages_messaging']
                            : ['instagram_manage_messages'],
                        requiresReconnect: false,
                    },
                    { status: 403 }
                );
            }
        }

        // For canvas mode, skip post accessibility check (handled at trigger node level)
        if (!isCanvasMode) {
            // Verify the post is accessible (can fetch comments)
            const testUrl = `${META_GRAPH_API_BASE_URL}/${platform_post_id}/comments?fields=id&limit=1&access_token=${account!.access_token}`;
            const testResponse = await fetch(testUrl);
            const testResult = await testResponse.json();

            if (!testResponse.ok || testResult.error) {
                console.error(`Post accessibility check failed: ${summarizeError(testResult?.error)}`);
                return NextResponse.json(
                    {
                        error: 'This post is not accessible. It may have been posted before your account was connected, or it has been deleted. Please select a more recent post.',
                        details: testResult.error?.message
                    },
                    { status: 400 }
                );
            }
        }

        // Create the automation
        const insertData: Record<string, unknown> = {
            workspace_id: activeWorkspace.id,
            social_account_id: resolvedAccountId,
            type: 'comment_to_dm',
            name,
            is_active: requestedIsActive,
            editor_version: shouldStoreCanvasEditor ? 'canvas' : 'wizard',
        };

        if (isCanvasMode) {
            insertData.workflow_graph = workflow_graph;
            // Keep legacy required columns populated for schema compatibility.
            insertData.dm_config = {
                opening_message: '',
                button_text: '',
                link_url: '',
                link_message: ''
            };
            insertData.comment_reply_config = { enabled: false, messages: [] };

            if (graphTriggerType === 'trigger_new_comment') {
                if (!graphPostId) {
                    if (requestedIsActive) {
                        return NextResponse.json(
                            { error: 'Comment trigger requires post_id' },
                            { status: 400 }
                        );
                    }

                    insertData.platform_post_id = '__wizard_draft__';
                    insertData.post_thumbnail_url = null;
                    insertData.post_caption = null;
                    insertData.trigger_config = {
                        trigger_type: graphTriggerConfigType,
                        keywords: graphTriggerKeywords
                    };
                } else {
                    insertData.platform_post_id = assertMetaGraphNodeId(graphPostId, 'post_id');
                    insertData.post_thumbnail_url = graphConfigValue(graphTriggerConfig, 'post_thumbnail_url') || null;
                    insertData.post_caption = graphConfigValue(graphTriggerConfig, 'post_caption') || null;
                    insertData.trigger_config = {
                        trigger_type: graphTriggerConfigType,
                        keywords: graphTriggerKeywords
                    };
                }
            } else {
                // Non-comment triggers don't have a post id; store a sentinel to satisfy legacy NOT NULL.
                insertData.platform_post_id = shouldStoreCanvasEditor ? '__canvas__' : '__wizard_graph__';
                insertData.trigger_config = { trigger_type: 'any_comment', keywords: [] };
            }
        } else {
            insertData.platform_post_id = validatedPlatformPostId;
            insertData.post_thumbnail_url = post_thumbnail_url;
            insertData.post_caption = post_caption;
            insertData.trigger_config = trigger_config || { trigger_type: 'any_comment', keywords: [] };
            insertData.comment_reply_config = comment_reply_config || { enabled: false, messages: [] };
            insertData.dm_config = dm_config;
        }

        const { data: automation, error: createError } = await supabase
            .from('automations')
            .insert(insertData)
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        // Legacy wizard mode only: pre-seed dedupe table.
        if (!isCanvasMode) {
            const { error: placeholderError } = await supabase
                .from('processed_comments')
                .insert({
                    workspace_id: activeWorkspace.id,
                    automation_id: automation.id,
                    comment_id: '00000000000'
                });

            if (placeholderError) {
                console.error('Failed to create placeholder processed_comment:', placeholderError);
                // Non-critical error, don't fail the automation creation
            }
        }

        return NextResponse.json({
            success: true,
            automation
        });

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid platform_post_id|Invalid post_id|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: summarizeError(error) || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Create automation API error:', error);
        console.error(`Create automation API details: ${summarizeError(error)}`);
        return NextResponse.json(
            {
                error: summarizeError(error) || 'Failed to create automation',
                details: errorDetail(error)
            },
            { status: 500 }
        );
    }
}
