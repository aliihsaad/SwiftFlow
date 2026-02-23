import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

// GET - List all automations for the workspace
export async function GET(request: NextRequest) {
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

    } catch (error: any) {
        console.error('Get automations API error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json(
            {
                error: error.message || 'Failed to fetch automations',
                details: error.details || error.hint || error.code || null
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
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const body = await request.json();
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
        } = body;

        // Canvas mode: workflow_graph is the primary payload
        const isCanvasMode = editor_version === 'canvas' || !!workflow_graph;
        const graphTriggerNode = workflow_graph?.nodes?.find((n: any) => n?.data?.type?.startsWith?.('trigger_'));
        const graphTriggerType = graphTriggerNode?.data?.type as string | undefined;
        const graphTriggerConfig = (graphTriggerNode?.data?.config || {}) as Record<string, any>;

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
        } else if (!social_account_id || !name || !platform_post_id || !dm_config) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Resolve social_account_id: from body or from graph trigger node
        const resolvedAccountId = social_account_id ||
            workflow_graph?.nodes?.find((n: any) => n.data?.config?.social_account_id)?.data?.config?.social_account_id;

        if (isCanvasMode && !resolvedAccountId) {
            return NextResponse.json(
                { error: 'Canvas trigger must include social_account_id' },
                { status: 400 }
            );
        }

        // Verify the social account belongs to this workspace
        let account: { id: string; access_token: string } | null = null;
        if (resolvedAccountId) {
            const { data: acc, error: accountError } = await supabase
                .from('social_accounts')
                .select('id, access_token')
                .eq('id', resolvedAccountId)
                .eq('workspace_id', activeWorkspace.id)
                .single();

            if (accountError || !acc) {
                return NextResponse.json(
                    { error: 'Invalid social account' },
                    { status: 400 }
                );
            }
            account = acc;
        } else if (!isCanvasMode) {
            return NextResponse.json(
                { error: 'Missing social account' },
                { status: 400 }
            );
        }

        // For canvas mode, skip post accessibility check (handled at trigger node level)
        if (!isCanvasMode) {
            // Verify the post is accessible (can fetch comments)
            const testUrl = `https://graph.facebook.com/v21.0/${platform_post_id}/comments?fields=id&limit=1&access_token=${account!.access_token}`;
            const testResponse = await fetch(testUrl);
            const testResult = await testResponse.json();

            if (!testResponse.ok || testResult.error) {
                console.error('Post accessibility check failed:', testResult.error);
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
        const insertData: Record<string, any> = {
            workspace_id: activeWorkspace.id,
            social_account_id: resolvedAccountId,
            type: 'comment_to_dm',
            name,
            is_active: true,
            editor_version: isCanvasMode ? 'canvas' : 'wizard',
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
                if (!graphTriggerConfig.post_id) {
                    return NextResponse.json(
                        { error: 'Comment trigger requires post_id' },
                        { status: 400 }
                    );
                }

                insertData.platform_post_id = graphTriggerConfig.post_id;
                insertData.post_thumbnail_url = graphTriggerConfig.post_thumbnail_url || null;
                insertData.post_caption = graphTriggerConfig.post_caption || null;
                insertData.trigger_config = {
                    trigger_type: graphTriggerConfig.trigger_type === 'keywords' ? 'keywords' : 'any_comment',
                    keywords: Array.isArray(graphTriggerConfig.keywords) ? graphTriggerConfig.keywords : []
                };
            } else {
                // Non-comment triggers don't have a post id; store a sentinel to satisfy legacy NOT NULL.
                insertData.platform_post_id = '__canvas__';
                insertData.trigger_config = { trigger_type: 'any_comment', keywords: [] };
            }
        } else {
            insertData.platform_post_id = platform_post_id;
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

    } catch (error: any) {
        console.error('Create automation API error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return NextResponse.json(
            {
                error: error.message || 'Failed to create automation',
                details: error.details || error.hint || error.code || null
            },
            { status: 500 }
        );
    }
}
