// @ts-nocheck - Deno runtime, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AutomationRow {
    id: string;
    workspace_id: string;
    social_account_id: string;
    platform_post_id: string;
    is_active: boolean;
    trigger_config: {
        trigger_type: 'any_comment' | 'keywords';
        keywords: string[];
    };
    comment_reply_config: {
        enabled: boolean;
        messages: string[];
    };
    dm_config: {
        opening_message: string;
        button_text: string;
        link_url: string;
        link_message?: string;
    };
    social_accounts: {
        id: string;
        account_id: string;
        access_token: string;
        platform: string;
        metadata: Record<string, any> | null;
    };
}

interface CommentData {
    id: string;
    text: string;
    from: {
        id: string;
        username?: string;
    };
    timestamp: string;
}

/**
 * Fetch new comments on a post from the Instagram Graph API
 */
async function fetchPostComments(
    postId: string,
    accessToken: string
): Promise<CommentData[]> {
    const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,text,from,timestamp&limit=50&access_token=${accessToken}`;

    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || result.error) {
        console.error(`Failed to fetch comments for post ${postId}:`, result.error);
        return [];
    }

    return result.data || [];
}

/**
 * Check if a comment matches the trigger config
 */
function doesCommentMatch(
    commentText: string,
    triggerConfig: AutomationRow['trigger_config']
): boolean {
    if (triggerConfig.trigger_type === 'any_comment') {
        return true;
    }

    if (triggerConfig.trigger_type === 'keywords' && triggerConfig.keywords.length > 0) {
        const lowerText = commentText.toLowerCase();
        return triggerConfig.keywords.some(keyword =>
            lowerText.includes(keyword.toLowerCase())
        );
    }

    return false;
}

/**
 * Reply to a comment on Instagram
 */
async function replyToComment(
    commentId: string,
    message: string,
    accessToken: string
): Promise<{ success: boolean; replyId?: string; error?: string }> {
    try {
        const url = `${META_GRAPH_URL}/${commentId}/replies`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                access_token: accessToken
            })
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            return {
                success: false,
                error: result.error?.message || 'Failed to reply to comment'
            };
        }

        return { success: true, replyId: result.id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Send a DM to a user via the Instagram Messaging API
 * Uses the page ID (connected_page_id) for sending
 */
async function sendDM(
    pageId: string,
    recipientId: string,
    dmConfig: AutomationRow['dm_config'],
    accessToken: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
        const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;

        // Send opening message
        const openingResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: { text: dmConfig.opening_message },
                access_token: accessToken,
            }),
        });

        const openingResult = await openingResponse.json();

        if (!openingResponse.ok || openingResult.error) {
            return {
                success: false,
                error: openingResult.error?.message || 'Failed to send opening DM'
            };
        }

        // Send the link message with button (as a generic template)
        const linkMessage = dmConfig.link_message
            ? `${dmConfig.link_message}\n\n${dmConfig.link_url}`
            : dmConfig.link_url;

        const linkResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                recipient: { id: recipientId },
                message: {
                    attachment: {
                        type: "template",
                        payload: {
                            template_type: "button",
                            text: dmConfig.link_message || "Here's your link!",
                            buttons: [
                                {
                                    type: "web_url",
                                    url: dmConfig.link_url,
                                    title: dmConfig.button_text
                                }
                            ]
                        }
                    }
                },
                access_token: accessToken,
            }),
        });

        const linkResult = await linkResponse.json();

        if (!linkResponse.ok || linkResult.error) {
            // If button template fails, fall back to plain text with link
            console.warn('Button template failed, falling back to plain text:', linkResult.error);

            const fallbackResponse = await fetch(sendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: recipientId },
                    message: { text: linkMessage },
                    access_token: accessToken,
                }),
            });

            const fallbackResult = await fallbackResponse.json();

            if (!fallbackResponse.ok || fallbackResult.error) {
                return {
                    success: false,
                    error: fallbackResult.error?.message || 'Failed to send link DM'
                };
            }
        }

        return { success: true, messageId: openingResult.message_id };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Process a single automation: fetch comments, match triggers, send DMs
 */
async function processAutomation(
    supabase: any,
    automation: AutomationRow
): Promise<{ processed: number; dmsSent: number; errors: number }> {
    const stats = { processed: 0, dmsSent: 0, errors: 0 };
    const account = automation.social_accounts;

    if (!account?.access_token) {
        console.error(`Automation ${automation.id}: No access token available`);
        return stats;
    }

    // 1. Fetch comments from Meta Graph API
    const comments = await fetchPostComments(
        automation.platform_post_id,
        account.access_token
    );

    if (comments.length === 0) {
        return stats;
    }

    // 2. Get already-handled comment IDs for this automation
    const commentIds = comments.map(c => c.id);
    const { data: handledRows } = await supabase
        .from('processed_comments')
        .select('comment_id')
        .eq('automation_id', automation.id)
        .in('comment_id', commentIds);

    const handledSet = new Set((handledRows || []).map((r: any) => r.comment_id));

    // 3. Filter to new, unhandled comments
    const newComments = comments.filter(c => !handledSet.has(c.id));

    if (newComments.length === 0) {
        return stats;
    }

    console.log(`Automation ${automation.id}: Processing ${newComments.length} new comments`);

    // 4. Determine the page ID for DM sending
    // Use connected_page_id from metadata (the Facebook Page linked to the Instagram account)
    const pageId = account.metadata?.connected_page_id || account.account_id;

    // 5. Process each new comment
    for (const comment of newComments) {
        // Check if comment matches trigger
        if (!doesCommentMatch(comment.text, automation.trigger_config)) {
            // Mark as handled even though it didn't match (so we don't check it again)
            await supabase.from('processed_comments').upsert({
                workspace_id: automation.workspace_id,
                automation_id: automation.id,
                comment_id: comment.id
            }, { onConflict: 'automation_id,comment_id' });
            continue;
        }

        stats.processed++;

        // Create a log entry
        const { data: logEntry, error: logError } = await supabase
            .from('automation_logs')
            .insert({
                automation_id: automation.id,
                trigger_comment_id: comment.id,
                commenter_id: comment.from.id,
                commenter_username: comment.from.username || null,
                status: 'processing'
            })
            .select()
            .single();

        if (logError) {
            console.error(`Automation ${automation.id}: Failed to create log:`, logError);
            stats.errors++;
            continue;
        }

        let commentReplySent = false;
        let dmSent = false;
        let errorMessage: string | null = null;

        try {
            // 5a. Reply to comment (if enabled)
            if (automation.comment_reply_config.enabled && automation.comment_reply_config.messages.length > 0) {
                // Pick a random reply message
                const replyMessage = automation.comment_reply_config.messages[
                    Math.floor(Math.random() * automation.comment_reply_config.messages.length)
                ];

                const replyResult = await replyToComment(
                    comment.id,
                    replyMessage,
                    account.access_token
                );

                commentReplySent = replyResult.success;
                if (!replyResult.success) {
                    console.warn(`Automation ${automation.id}: Comment reply failed:`, replyResult.error);
                }
            }

            // 5b. Send DM
            const dmResult = await sendDM(
                pageId,
                comment.from.id,
                automation.dm_config,
                account.access_token
            );

            dmSent = dmResult.success;
            if (!dmResult.success) {
                errorMessage = dmResult.error || 'DM sending failed';
                console.warn(`Automation ${automation.id}: DM failed for ${comment.from.id}:`, dmResult.error);
            }

            if (dmSent) {
                stats.dmsSent++;
            }
        } catch (error) {
            errorMessage = error.message;
            stats.errors++;
            console.error(`Automation ${automation.id}: Error processing comment ${comment.id}:`, error);
        }

        // Update the log entry
        await supabase
            .from('automation_logs')
            .update({
                comment_reply_sent: commentReplySent,
                dm_sent: dmSent,
                status: dmSent ? 'completed' : (errorMessage ? 'failed' : 'completed'),
                error_message: errorMessage
            })
            .eq('id', logEntry.id);

        // Mark comment as handled
        await supabase.from('processed_comments').upsert({
            workspace_id: automation.workspace_id,
            automation_id: automation.id,
            comment_id: comment.id
        }, { onConflict: 'automation_id,comment_id' });
    }

    // 6. Update automation stats
    if (stats.processed > 0 || stats.dmsSent > 0) {
        // Fetch current stats and increment
        const { data: currentAutomation } = await supabase
            .from('automations')
            .select('total_triggered, total_dms_sent')
            .eq('id', automation.id)
            .single();

        if (currentAutomation) {
            await supabase
                .from('automations')
                .update({
                    total_triggered: (currentAutomation.total_triggered || 0) + stats.processed,
                    total_dms_sent: (currentAutomation.total_dms_sent || 0) + stats.dmsSent,
                    updated_at: new Date().toISOString()
                })
                .eq('id', automation.id);
        }
    }

    return stats;
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // Create Supabase client with service role for full access
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        });

        // Parse optional body for workspace filtering
        let targetWorkspaceId: string | null = null;
        let targetAutomationId: string | null = null;

        if (req.method === 'POST') {
            try {
                const body = await req.json();
                targetWorkspaceId = body.workspace_id || null;
                targetAutomationId = body.automation_id || null;
            } catch {
                // No body or invalid JSON, process all
            }
        }

        // Fetch active automations with their social account details
        let query = supabase
            .from('automations')
            .select(`
                *,
                social_accounts (
                    id,
                    account_id,
                    access_token,
                    platform,
                    metadata
                )
            `)
            .eq('is_active', true);

        if (targetWorkspaceId) {
            query = query.eq('workspace_id', targetWorkspaceId);
        }

        if (targetAutomationId) {
            query = query.eq('id', targetAutomationId);
        }

        const { data: automations, error: fetchError } = await query;

        if (fetchError) {
            throw new Error(`Failed to fetch automations: ${fetchError.message}`);
        }

        if (!automations || automations.length === 0) {
            return new Response(
                JSON.stringify({
                    success: true,
                    message: 'No active automations to process',
                    stats: { total: 0, processed: 0, dmsSent: 0, errors: 0 }
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                }
            );
        }

        console.log(`Processing ${automations.length} active automations...`);

        // Process each automation
        const totalStats = { total: automations.length, processed: 0, dmsSent: 0, errors: 0 };

        for (const automation of automations) {
            try {
                const stats = await processAutomation(supabase, automation as AutomationRow);
                totalStats.processed += stats.processed;
                totalStats.dmsSent += stats.dmsSent;
                totalStats.errors += stats.errors;
            } catch (error) {
                console.error(`Error processing automation ${automation.id}:`, error);
                totalStats.errors++;
            }
        }

        console.log('Automation processing complete:', totalStats);

        return new Response(
            JSON.stringify({
                success: true,
                message: `Processed ${totalStats.total} automations`,
                stats: totalStats
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        );

    } catch (error) {
        console.error('Process automations error:', error);
        return new Response(
            JSON.stringify({
                error: error.message || 'Internal server error'
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            }
        );
    }
});
