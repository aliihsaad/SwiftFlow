// @ts-nocheck - Deno runtime, not Node.js
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { executeWorkflowGraph } from "./graph-executor.ts"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { canManageMessagesWithMetaAccount, canReadCommentsWithMetaAccount, decryptMetaAccountRow } from "../_shared/meta-account.ts"
import { resolveAIConfig } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"
import { buildAutomationAiPrompt } from "../_shared/automation-context.ts"

import { isSafeMetaGraphNodeId, META_GRAPH_API_BASE_URL, toMetaGraphFormBody } from "../_shared/meta-graph.ts";
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts";

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

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
        use_ai_response?: boolean;
    };
    dm_config: {
        opening_message: string;
        button_text: string;
        link_url: string;
        link_message?: string;
        use_ai_response?: boolean;
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
    if (!isSafeMetaGraphNodeId(postId)) {
        console.error(`Rejected unsafe Meta post ID: ${postId}`);
        return [];
    }
    const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,text,from,timestamp&limit=50&access_token=${accessToken}`;

    const response = await fetch(url);
    const result = await response.json();

    if (!response.ok || result.error) {
        console.error(`Failed to fetch comments for post ${postId}:`, redactSensitiveLogValue(result.error));
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
        if (!isSafeMetaGraphNodeId(commentId)) {
            return { success: false, error: 'Unsafe comment ID rejected' };
        }
        const url = `${META_GRAPH_URL}/${commentId}/replies`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: await toMetaGraphFormBody({
                message,
                access_token: accessToken
            }, accessToken)
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
 * Error codes/subcodes that indicate the user can't receive normal DMs
 * (no prior conversation or messaging window closed).
 * On these, we fall back to private reply via recipient: { comment_id }.
 */
const DM_FALLBACK_CODES = new Set([
    '551',           // User not available
    '551:1545041',   // Messaging not possible
    '200:1545041',   // Permission/window issue
    '10:2018108',    // Outside messaging window
    '10:2534022',    // Outside window variant
    '10:2018278',    // Outside window variant
]);

function isDmFallbackError(error: { code?: number; error_subcode?: number }): boolean {
    const key1 = String(error.code);
    const key2 = `${error.code}:${error.error_subcode}`;
    return DM_FALLBACK_CODES.has(key1) || DM_FALLBACK_CODES.has(key2);
}

interface DmResult {
    success: boolean;
    messageId?: string;
    channel?: 'dm' | 'private_reply';
    error?: string;
}

/**
 * Send a DM to a user via the Instagram Messaging API.
 * Strategy: try normal DM first, fall back to private reply on window errors.
 *
 * Normal DM:      recipient: { id: recipientId }
 * Private reply:  recipient: { comment_id: commentId }
 */
async function sendDM(
    pageId: string,
    recipientId: string,
    commentId: string,
    dmConfig: AutomationRow['dm_config'],
    accessToken: string
): Promise<DmResult> {
    const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;

    // ── Attempt 1: Normal DM with recipient.id ──────────────────────
    try {
        const openingResponse = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: await toMetaGraphFormBody({
                recipient: { id: recipientId },
                message: { text: dmConfig.opening_message },
                access_token: accessToken,
            }, accessToken),
        });

        const openingResult = await openingResponse.json();

        if (!openingResponse.ok || openingResult.error) {
            const err = openingResult.error || {};
            console.warn(`[DM] Normal DM failed (code ${err.code}/${err.error_subcode}):`, redactSensitiveLogValue(err.message));

            // Only fall back on window/recipient errors
            if (isDmFallbackError(err)) {
                console.log(`[DM] Falling back to private reply for comment ${commentId}`);
                return await sendPrivateReply(sendUrl, commentId, dmConfig, accessToken);
            }

            // Token/permission errors — don't retry
            return { success: false, error: err.message || 'DM failed (non-retryable)' };
        }

        // Normal DM succeeded — now send the link/button follow-up
        await sendLinkFollowUp(sendUrl, recipientId, dmConfig, accessToken);

        return { success: true, messageId: openingResult.message_id, channel: 'dm' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Private reply fallback: send via recipient: { comment_id }.
 * Only plain text — templates aren't supported in private replies.
 */
async function sendPrivateReply(
    sendUrl: string,
    commentId: string,
    dmConfig: AutomationRow['dm_config'],
    accessToken: string
): Promise<DmResult> {
    try {
        if (!isSafeMetaGraphNodeId(commentId)) {
            return { success: false, error: 'Unsafe comment ID rejected' };
        }
        // Combine opening message + link into one plain text message
        const text = dmConfig.link_url
            ? `${dmConfig.opening_message}\n\n${dmConfig.link_url}`
            : dmConfig.opening_message;

        const response = await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: await toMetaGraphFormBody({
                recipient: { comment_id: commentId },
                message: { text },
                access_token: accessToken,
            }, accessToken),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            return {
                success: false,
                error: result.error?.message || 'Private reply failed',
            };
        }

        return { success: true, messageId: result.message_id, channel: 'private_reply' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Send the link/button follow-up after a successful normal DM.
 * Tries button template first, falls back to plain text.
 */
async function sendLinkFollowUp(
    sendUrl: string,
    recipientId: string,
    dmConfig: AutomationRow['dm_config'],
    accessToken: string
): Promise<void> {
    if (!dmConfig.link_url) return;

    const linkMessage = dmConfig.link_message
        ? `${dmConfig.link_message}\n\n${dmConfig.link_url}`
        : dmConfig.link_url;

    // Try button template
    const linkResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: await toMetaGraphFormBody({
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'button',
                        text: dmConfig.link_message || "Here's your link!",
                        buttons: [{
                            type: 'web_url',
                            url: dmConfig.link_url,
                            title: dmConfig.button_text,
                        }],
                    },
                },
            },
            access_token: accessToken,
        }, accessToken),
    });

    const linkResult = await linkResponse.json();

    if (!linkResponse.ok || linkResult.error) {
        // Fall back to plain text with link
        console.warn('[DM] Button template failed, sending plain text:', redactSensitiveLogValue(linkResult.error?.message));
        await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: await toMetaGraphFormBody({
                recipient: { id: recipientId },
                message: { text: linkMessage },
                access_token: accessToken,
            }, accessToken),
        });
    }
}

/**
 * Process a single automation via polling: fetch comments, match triggers, send DMs.
 * Used as fallback when no webhook_context is available (cron invocations).
 */
async function processAutomation(
    supabase: any,
    automation: AutomationRow
): Promise<{ processed: number; dmsSent: number; errors: number }> {
    const stats = { processed: 0, dmsSent: 0, errors: 0 };
    const account = automation.social_accounts ? await decryptMetaAccountRow(automation.social_accounts) : null;

    if (!account?.access_token) {
        console.error(`Automation ${automation.id}: No access token available`);
        return stats;
    }

    if (!canReadCommentsWithMetaAccount(
        account.metadata,
        account.platform === 'facebook' ? 'facebook' : 'instagram',
    )) {
        console.error(`Automation ${automation.id}: Missing comment-read capability`);
        return stats;
    }

    if (!canManageMessagesWithMetaAccount(
        account.metadata,
        account.platform === 'facebook' ? 'facebook' : 'instagram',
    )) {
        console.error(`Automation ${automation.id}: Missing messaging capability`);
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

    console.log(`Automation ${automation.id}: Processing ${newComments.length} new comments (polling)`);

    // 4. Determine the page ID for DM sending
    const pageId = account.metadata?.connected_page_id || account.account_id;

    // 5. Process each new comment (skip self-comments from the page/bot)
    for (const comment of newComments) {
        if (comment.from.id === account.account_id || comment.from.id === pageId) {
            continue;
        }
        const result = await processSingleComment(
            supabase, automation, comment, pageId, account.access_token
        );
        stats.processed += result.processed;
        stats.dmsSent += result.dmsSent;
        stats.errors += result.errors;
    }

    // 6. Update automation stats
    if (stats.processed > 0 || stats.dmsSent > 0) {
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

/**
 * Generate an AI reply for a comment trigger using the workspace's AI provider.
 * Returns null if generation fails so the caller can fall back gracefully.
 */
async function generateAiReplyForComment(
    supabase: any,
    workspaceId: string,
    comment: CommentData,
): Promise<string | null> {
    try {
        const aiConfig = await resolveAIConfig({ supabase, workspaceId, useGlobalSettings: true });
        const prompt = buildAutomationAiPrompt(
            { preset_goal: 'reply_comment', tone: 'friendly', length: 'short', emoji_level: 'light' },
            {
                comment_id: comment.id,
                comment_text: comment.text,
                commenter_username: comment.from.username,
                commenter_id: comment.from.id,
            } as any,
        );
        const text = await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName: aiConfig.modelName,
            prompt,
            temperature: aiConfig.temperature,
            maxTokens: aiConfig.maxTokens,
        });
        return requireGeneratedText(text);
    } catch (err) {
        console.error('[AI_REPLY] Generation failed:', redactSensitiveLogValue(err?.message || err));
        return null;
    }
}

function getDefaultCommentReplyFallback(comment: CommentData): string {
    const username = String(comment.from?.username || '').trim();
    return username ? `Thanks for your comment, ${username}!` : 'Thanks for your comment!';
}

/**
 * Process a single comment against an automation: match trigger, reply, DM.
 * Shared by both the webhook fast path and the polling path.
 */
async function processSingleComment(
    supabase: any,
    automation: AutomationRow,
    comment: CommentData,
    pageId: string,
    accessToken: string
): Promise<{ processed: number; dmsSent: number; errors: number }> {
    const stats = { processed: 0, dmsSent: 0, errors: 0 };

    // Dedup: skip if this comment was already processed for this automation
    const { data: existing } = await supabase
        .from('processed_comments')
        .select('comment_id')
        .eq('automation_id', automation.id)
        .eq('comment_id', comment.id)
        .maybeSingle();

    if (existing) {
        console.log(`Automation ${automation.id}: Comment ${comment.id} already processed, skipping`);
        return stats;
    }

    // Check if comment matches trigger
    if (!doesCommentMatch(comment.text, automation.trigger_config)) {
        // Mark as handled so we don't check again
        await supabase.from('processed_comments').upsert({
            workspace_id: automation.workspace_id,
            automation_id: automation.id,
            comment_id: comment.id
        }, { onConflict: 'automation_id,comment_id' });
        return stats;
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
        console.error(`Automation ${automation.id}: Failed to create log:`, redactSensitiveLogValue(logError));
        stats.errors++;
        return stats;
    }

    let commentReplySent = false;
    let dmSent = false;
    let dmChannel: string | null = null;
    let errorMessage: string | null = null;

    try {
        const replyWantsAi = automation.comment_reply_config.enabled === true
            && automation.comment_reply_config.use_ai_response === true;
        const dmWantsAi = automation.dm_config?.use_ai_response === true
            && (automation.dm_config?.opening_message?.trim() || automation.dm_config?.use_ai_response);

        // Generate AI text once per comment if any branch needs it
        let aiText: string | null = null;
        if (replyWantsAi || dmWantsAi) {
            aiText = await generateAiReplyForComment(supabase, automation.workspace_id, comment);
        }

        // Reply to comment (if enabled)
        const hasReplyMessages = automation.comment_reply_config.messages.length > 0;
        if (automation.comment_reply_config.enabled && (replyWantsAi || hasReplyMessages)) {
            let replyMessage = '';
            if (replyWantsAi && aiText) {
                replyMessage = aiText;
            } else if (hasReplyMessages) {
                replyMessage = automation.comment_reply_config.messages[
                    Math.floor(Math.random() * automation.comment_reply_config.messages.length)
                ];
            } else if (replyWantsAi) {
                replyMessage = getDefaultCommentReplyFallback(comment);
            }

            if (replyMessage) {
                const replyResult = await replyToComment(comment.id, replyMessage, accessToken);
                commentReplySent = replyResult.success;
                if (!replyResult.success) {
                    console.warn(`Automation ${automation.id}: Comment reply failed:`, redactSensitiveLogValue(replyResult.error));
                }
            }
        }

        // Send DM (only if dm_config has content or AI is enabled)
        const dmEnabled = !!(automation.dm_config?.opening_message?.trim() || automation.dm_config?.use_ai_response);
        if (dmEnabled) {
            const dmConfigForSend = (dmWantsAi && aiText)
                ? { ...automation.dm_config, opening_message: aiText }
                : automation.dm_config;

            const dmResult = await sendDM(
                pageId,
                comment.from.id,
                comment.id,
                dmConfigForSend,
                accessToken
            );

            dmSent = dmResult.success;
            dmChannel = dmResult.channel || null;
            if (!dmResult.success) {
                errorMessage = dmResult.error || 'DM sending failed';
                console.warn(`Automation ${automation.id}: DM failed for ${comment.from.id}:`, redactSensitiveLogValue(dmResult.error));
            }
        }

        if (dmSent) stats.dmsSent++;
    } catch (error) {
        errorMessage = error.message;
        stats.errors++;
        console.error(`Automation ${automation.id}: Error processing comment ${comment.id}:`, redactSensitiveLogValue(error));
    }

    // Update the log entry
    await supabase
        .from('automation_logs')
        .update({
            comment_reply_sent: commentReplySent,
            dm_sent: dmSent,
            dm_channel: dmChannel,
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

    return stats;
}

// ============================================
// Webhook fast path
// ============================================

interface WebhookContext {
    comment_id: string;
    post_id: string;
    commenter_id: string;
    commenter_username?: string;
    comment_text: string;
    timestamp?: string;
}

/**
 * Process a single comment received directly from the webhook,
 * skipping the Graph API poll entirely.
 */
async function processWebhookComment(
    supabase: any,
    webhookCtx: WebhookContext,
    workspaceId: string,
    targetEditorVersion: 'wizard' | 'canvas' | null = null,
): Promise<{ processed: number; dmsSent: number; errors: number }> {
    const totalStats = { processed: 0, dmsSent: 0, errors: 0 };

    // Find active automations for this specific post + workspace
    let query = supabase
        .from('automations')
        .select(`
            *,
            social_accounts (
                id, account_id, access_token, platform, metadata
            )
        `)
        .eq('is_active', true)
        .eq('workspace_id', workspaceId)
        .eq('platform_post_id', webhookCtx.post_id);

    if (targetEditorVersion) {
        query = query.eq('editor_version', targetEditorVersion);
    }

    const { data: automations, error } = await query;

    if (error) {
        console.error('[WEBHOOK_FAST] Failed to fetch automations:', redactSensitiveLogValue(error));
        return totalStats;
    }

    if (!automations || automations.length === 0) {
        console.log(`[WEBHOOK_FAST] No active automations for post ${webhookCtx.post_id}`);
        return totalStats;
    }

    console.log(`[WEBHOOK_FAST] Found ${automations.length} automation(s) for post ${webhookCtx.post_id}`);

    // Build a CommentData object from the webhook context
    const comment: CommentData = {
        id: webhookCtx.comment_id,
        text: webhookCtx.comment_text,
        from: {
            id: webhookCtx.commenter_id,
            username: webhookCtx.commenter_username,
        },
        timestamp: webhookCtx.timestamp || new Date().toISOString(),
    };

    for (const automation of automations) {
        const auto = automation as AutomationRow;
        const account = auto.social_accounts ? await decryptMetaAccountRow(auto.social_accounts) : null;

        if (!account?.access_token) {
            console.error(`[WEBHOOK_FAST] Automation ${auto.id}: No access token`);
            totalStats.errors++;
            continue;
        }

        if (!canReadCommentsWithMetaAccount(
            account.metadata,
            account.platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            console.error(`[WEBHOOK_FAST] Automation ${auto.id}: Missing comment-read capability`);
            totalStats.errors++;
            continue;
        }

        if (!canManageMessagesWithMetaAccount(
            account.metadata,
            account.platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            console.error(`[WEBHOOK_FAST] Automation ${auto.id}: Missing messaging capability`);
            totalStats.errors++;
            continue;
        }

        // Skip comments from the page/account itself (bot's own replies)
        const pageId = account.metadata?.connected_page_id || account.account_id;
        if (webhookCtx.commenter_id === account.account_id || webhookCtx.commenter_id === pageId) {
            console.log(`[WEBHOOK_FAST] Skipping self-comment from account ${webhookCtx.commenter_id}`);
            continue;
        }

        // Route based on editor_version: canvas mode uses graph executor
        if (auto.editor_version === 'canvas' && auto.workflow_graph) {
            console.log(`[WEBHOOK_FAST] Using graph executor for automation ${auto.id}`);
            const graphResult = await executeWorkflowGraph(
                supabase,
                auto,
                {
                    comment_id: webhookCtx.comment_id,
                    post_id: webhookCtx.post_id,
                    commenter_id: webhookCtx.commenter_id,
                    commenter_username: webhookCtx.commenter_username,
                    comment_text: webhookCtx.comment_text,
                    timestamp: webhookCtx.timestamp,
                },
                account,
                { executionKey: `comment:${webhookCtx.comment_id}` },
            );

            totalStats.processed += graphResult.processed;
            totalStats.dmsSent += graphResult.dmsSent;
            totalStats.errors += graphResult.errors;

            // Update automation stats
            if (graphResult.processed > 0 || graphResult.dmsSent > 0) {
                const { data: current } = await supabase
                    .from('automations')
                    .select('total_triggered, total_dms_sent')
                    .eq('id', auto.id)
                    .single();

                if (current) {
                    await supabase
                        .from('automations')
                        .update({
                            total_triggered: (current.total_triggered || 0) + graphResult.processed,
                            total_dms_sent: (current.total_dms_sent || 0) + graphResult.dmsSent,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', auto.id);
                }
            }

            continue;
        }

        // Legacy wizard mode: use existing linear processing
        const result = await processSingleComment(
            supabase, auto, comment, pageId, account.access_token
        );

        totalStats.processed += result.processed;
        totalStats.dmsSent += result.dmsSent;
        totalStats.errors += result.errors;

        // Update automation stats
        if (result.processed > 0 || result.dmsSent > 0) {
            const { data: current } = await supabase
                .from('automations')
                .select('total_triggered, total_dms_sent')
                .eq('id', auto.id)
                .single();

            if (current) {
                await supabase
                    .from('automations')
                    .update({
                        total_triggered: (current.total_triggered || 0) + result.processed,
                        total_dms_sent: (current.total_dms_sent || 0) + result.dmsSent,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', auto.id);
            }
        }
    }

    return totalStats;
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Internal dispatcher only (webhook routes via admin client, scheduler).
    const unauthorized = await assertInternalInvoke(req, corsHeaders);
    if (unauthorized) return unauthorized;

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

        // Parse optional body for workspace filtering and webhook context
        let targetWorkspaceId: string | null = null;
        let targetAutomationId: string | null = null;
        let targetEditorVersion: 'wizard' | 'canvas' | null = null;
        let webhookContext: WebhookContext | null = null;

        if (req.method === 'POST') {
            try {
                const body = await req.json();
                targetWorkspaceId = body.workspace_id || null;
                targetAutomationId = body.automation_id || null;
                targetEditorVersion = (body.target_editor_version === 'wizard' || body.target_editor_version === 'canvas')
                    ? body.target_editor_version
                    : null;

                // Check for webhook context (comment data from the webhook handler)
                if (body.webhook_context?.comment_id && body.webhook_context?.post_id) {
                    webhookContext = body.webhook_context as WebhookContext;
                }
            } catch {
                // No body or invalid JSON, process all
            }
        }

        // ── Webhook fast path ─────────────────────────────────────────
        // When invoked from the webhook handler with comment data,
        // skip polling and process the single comment directly.
        if (webhookContext && targetWorkspaceId) {
            console.log(`[WEBHOOK_FAST] Processing comment ${webhookContext.comment_id} for workspace ${targetWorkspaceId}`);
            const stats = await processWebhookComment(supabase, webhookContext, targetWorkspaceId, targetEditorVersion);

            return new Response(
                JSON.stringify({
                    success: true,
                    message: `Webhook fast path: processed comment ${webhookContext.comment_id}`,
                    path: 'webhook',
                    stats: { total: 1, ...stats }
                }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 200
                }
            );
        }

        // ── Polling path (cron / manual invocation) ──────────────────

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
                // Canvas-mode automations are only processed via webhook fast path
                // or scheduled executions — skip them in polling
                if (automation.editor_version === 'canvas') {
                    console.log(`Skipping canvas automation ${automation.id} in polling path`);
                    continue;
                }

                const stats = await processAutomation(supabase, automation as AutomationRow);
                totalStats.processed += stats.processed;
                totalStats.dmsSent += stats.dmsSent;
                totalStats.errors += stats.errors;
            } catch (error) {
                console.error(`Error processing automation ${automation.id}:`, redactSensitiveLogValue(error));
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
        console.error('Process automations error:', redactSensitiveLogValue(error));
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
