import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { decryptMetaAccountRow } from '@/lib/meta-account';
import { isReviewPhase1Release } from '@/lib/release-channel';
import { enqueueMetaWebhookDelivery } from '@/lib/webhooks/inbox-contract';
import { buildInstagramMessagingAutomationEvents } from '@/lib/webhooks/instagram-automation-events';
import { createSupabaseWebhookInboxStore } from '@/lib/webhooks/supabase-inbox-store';
import { readRawBodyWithLimit, RequestBodyTooLargeError } from '@/lib/security/phase1-validation';
import { requireSupabaseServiceRoleKey } from '@/lib/supabase/service-key';

// Meta webhook payloads are small (batched entries stay well under this cap).
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

/** Build a deterministic key from a payload object, falling back to a hash when no stable ID exists */
function stableEventKey(prefix: string, value: Record<string, unknown> | undefined): string {
    const id = value?.id as string | undefined;
    if (id) return `${prefix}:${id}`;
    // Hash the full payload so retries with the same body produce the same key
    const hash = crypto.createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex').slice(0, 16);
    return `${prefix}:hash_${hash}`;
}

function isDevInstagramMessageWebhookDebugEnabled(): boolean {
    const flag = (process.env.DEBUG_INSTAGRAM_MESSAGE_WEBHOOK_PAYLOAD || '').toLowerCase().trim();
    return process.env.NODE_ENV !== 'production' && ['1', 'true', 'yes', 'on'].includes(flag);
}

function isWebhookInboxShadowEnabled(): boolean {
    const flag = (process.env.WEBHOOK_INBOX_SHADOW_ENABLED || '').toLowerCase().trim();
    return ['1', 'true', 'yes', 'on'].includes(flag);
}


function summarizeWebhookPayloadShape(raw: unknown, depth = 0): unknown {
    if (raw == null) return raw;
    if (depth > 2) {
        if (Array.isArray(raw)) return `[array:${raw.length}]`;
        if (typeof raw === 'object') return '[object]';
        return raw;
    }

    if (Array.isArray(raw)) {
        return {
            _type: 'array',
            length: raw.length,
            sample: raw.slice(0, 2).map((item) => summarizeWebhookPayloadShape(item, depth + 1)),
        };
    }

    if (typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        const entries = Object.entries(obj).slice(0, 20).map(([key, value]) => [key, summarizeWebhookPayloadShape(value, depth + 1)]);
        return Object.fromEntries(entries);
    }

    if (typeof raw === 'string') {
        return raw.length > 160 ? `${raw.slice(0, 160)}…` : raw;
    }

    return raw;
}

function logInstagramMessageWebhookDebug(value: Record<string, unknown>) {
    if (!isDevInstagramMessageWebhookDebugEnabled()) return;

    const message = value?.message as Record<string, unknown> | undefined;
    const summary = {
        entryKeys: Object.keys(value || {}),
        valueTimestamp: value?.timestamp,
        messageKeys: message ? Object.keys(message) : [],
        messageMid: (message?.mid || value?.id) as string | undefined,
        messageTextPreview: typeof (message?.text || value?.text) === 'string'
            ? String(message?.text || value?.text).slice(0, 120)
            : null,
        hasAttachmentsField: !!(message && 'attachments' in message) || 'attachments' in value,
        hasSharesField: !!(message && ('shares' in message || 'share' in message)) || 'shares' in value || 'share' in value,
        messageAttachmentsShape: summarizeWebhookPayloadShape(message?.attachments),
        valueAttachmentsShape: summarizeWebhookPayloadShape(value?.attachments),
        messageSharesShape: summarizeWebhookPayloadShape(message?.shares ?? message?.share),
        valueSharesShape: summarizeWebhookPayloadShape(value?.shares ?? value?.share),
    };

    console.log('[WEBHOOK][DEV][IG_MESSAGE_PAYLOAD]', JSON.stringify(summary));
}

// Initialize Supabase Admin Client
const supabaseServiceKey = requireSupabaseServiceRoleKey();
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseServiceKey
);

/**
 * GET /api/webhooks/instagram
 * Meta Webhook Verification Handshake
 *
 * Meta sends a GET request with hub.mode, hub.verify_token, and hub.challenge.
 * We return the challenge if the token matches our env var.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    console.log('[WEBHOOK] Verification request:', { mode, hasToken: !!token, hasChallenge: !!challenge });

    if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
        console.log('[WEBHOOK] Verification successful');
        // Must return the challenge as plain text, not JSON
        return new NextResponse(challenge, { status: 200 });
    }

    console.warn('[WEBHOOK] Verification failed — token mismatch');
    return new NextResponse('Forbidden', { status: 403 });
}

/**
 * POST /api/webhooks/instagram
 * Receive and process webhook events from Meta.
 *
 * Flow:
 * 1. Verify X-Hub-Signature-256 (HMAC SHA256)
 * 2. Parse event payload
 * 3. Await processing (resolve account → route to handler)
 * 4. Return 200 on success, 500 on failure (Meta retries non-2xx)
 */
export async function POST(request: NextRequest) {
    const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();

    if (!appSecret) {
        console.error('[WEBHOOK] Missing INSTAGRAM_APP_SECRET');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Step 1: Read raw body as bytes (bounded) and verify signature
    const signature = request.headers.get('x-hub-signature-256');

    if (!signature) {
        console.warn('[WEBHOOK] Missing X-Hub-Signature-256 header');
        return new NextResponse('Missing signature', { status: 401 });
    }

    let rawBuffer: Buffer;
    try {
        rawBuffer = Buffer.from(await readRawBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES));
    } catch (error) {
        if (error instanceof RequestBodyTooLargeError) {
            console.warn('[WEBHOOK] Payload exceeded size cap; rejecting');
            return new NextResponse('Payload too large', { status: 413 });
        }
        throw error;
    }
    const rawBody = rawBuffer.toString('utf8');

    const expectedSignature =
        'sha256=' +
        crypto.createHmac('sha256', appSecret).update(rawBuffer).digest('hex');
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureMatches =
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

    console.log('[WEBHOOK] Signature debug:', {
        receivedPrefix: signature.substring(0, 20),
        expectedPrefix: expectedSignature.substring(0, 20),
        match: signatureMatches,
        bodyLen: rawBuffer.length,
    });

    if (!signatureMatches) {
        console.warn('[WEBHOOK] Signature verification failed');
        return new NextResponse('Invalid signature', { status: 401 });
    }

    // Step 2: Parse the event payload
    let body: Record<string, unknown>;
    try {
        body = JSON.parse(rawBody);
    } catch {
        console.error('[WEBHOOK] Failed to parse JSON body');
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('[WEBHOOK] Event received:', {
        object: body.object,
        entries: (body.entry as unknown[])?.length || 0,
        payloadShape: summarizeWebhookPayloadShape(body),
    });

    if (isReviewPhase1Release()) {
        console.log('[WEBHOOK] review_phase_1 active; acknowledging event without processing side effects');
        return NextResponse.json(
            {
                received: true,
                skipped: true,
                reason: 'review_phase_1_webhook_processing_disabled',
            },
            { status: 200 }
        );
    }
    // Optional compatibility phase: copy verified events into the durable inbox
    // while the existing synchronous path remains authoritative. Shadow failures
    // never change the current acknowledgement or automation behavior.
    if (isWebhookInboxShadowEnabled()) {
        try {
            const inboxResult = await enqueueMetaWebhookDelivery(
                createSupabaseWebhookInboxStore(supabaseAdmin),
                body,
                rawBuffer,
            );
            console.log('[WEBHOOK] Durable inbox shadow capture:', inboxResult);
        } catch (error) {
            console.warn('[WEBHOOK] Durable inbox shadow capture failed; continuing synchronous processing:', {
                message: error instanceof Error ? error.message : 'Unknown inbox error',
            });
        }
    }

    // Process events synchronously — Vercel serverless terminates after response,
    // so we MUST await processing before returning.
    // Return non-2xx on failure so Meta retries the webhook delivery.
    try {
        await processWebhookEvents(body);
    } catch (err) {
        console.error('[WEBHOOK] Error processing events:', err);
        return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
}

// ============================================
// Event Processing (runs synchronously before response)
// ============================================

async function processWebhookEvents(body: Record<string, unknown>) {
    if (body.object !== 'instagram') {
        console.log(`[WEBHOOK] Ignoring object type: ${body.object}`);
        return;
    }

    const entries = (body.entry || []) as Record<string, unknown>[];
    for (const entry of entries) {
        const entryId = entry.id as string; // Instagram professional account ID

        // Resolve which workspace/account this event belongs to
        const account = await resolveAccount(entryId);
        if (!account) {
            console.warn(`[WEBHOOK] No account found for entry ID: ${entryId}`);
            continue;
        }

        console.log(`[WEBHOOK] Resolved account: workspace=${account.workspace_id}, platform=${account.platform}`);

        // Process changes within this entry
        const changes = (entry.changes || []) as Record<string, unknown>[];
        for (const change of changes) {
            const eventKey = stableEventKey(`${entryId}:${change.field as string}`, change.value as Record<string, unknown>);

            // Idempotency check
            const isDuplicate = await checkIdempotency(eventKey, account.workspace_id, change.field as string);
            if (isDuplicate) {
                console.log(`[WEBHOOK] Duplicate event skipped: ${eventKey}`);
                continue;
            }

            switch (change.field as string) {
                case 'comments':
                case 'live_comments':
                    await handleCommentEvent(change.value as Record<string, unknown>, account);
                    break;
                case 'messages':
                    await handleMessageEvent(change.value as Record<string, unknown>, account);
                    // Also trigger message-based automations
                    await handleMessageAutomationTrigger(change.value as Record<string, unknown>, account);
                    break;
                case 'mentions':
                    await handleStoryMentionEvent(change.value as Record<string, unknown>, account);
                    break;
                case 'story_insights':
                    // Story replies come through story_insights
                    await handleStoryReplyEvent(change.value as Record<string, unknown>, account);
                    break;
                default:
                    console.log(`[WEBHOOK] Unknown field: ${change.field}`);
            }
        }

        // Also handle direct messaging entries (messaging array, not changes)
        const messagingEntries = (entry.messaging || []) as Record<string, unknown>[];
        for (const messaging of messagingEntries) {
            const messagePayload = messaging.message as Record<string, unknown> | undefined;
            const eventKey = stableEventKey(`${entryId}:messaging`, { id: messagePayload?.mid, ...messaging });

            const isDuplicate = await checkIdempotency(eventKey, account.workspace_id, 'messaging');
            if (isDuplicate) {
                console.log(`[WEBHOOK] Duplicate messaging event skipped: ${eventKey}`);
                continue;
            }

            await handleMessageEvent(messaging, account);
            await handleMessageAutomationTrigger(messaging, account);
        }
    }
}

// ============================================
// Account Resolution
// ============================================

interface ResolvedAccount {
    workspace_id: string;
    social_account_id: string;
    account_id: string;
    platform: 'instagram';
    access_token: string;
    metadata: Record<string, unknown> | null;
}

async function resolveAccount(entryId: string): Promise<ResolvedAccount | null> {
    // Strategy 1: Match by account_id (IG Business Account ID)
    const { data: account } = await supabaseAdmin
        .from('social_accounts')
        .select('id, workspace_id, account_id, platform, access_token, metadata')
        .eq('account_id', entryId)
        .eq('platform', 'instagram')
        .maybeSingle();

    if (account) {
        const decryptedAccount = decryptMetaAccountRow(account);
        return {
            workspace_id: decryptedAccount.workspace_id,
            social_account_id: decryptedAccount.id,
            account_id: decryptedAccount.account_id,
            platform: 'instagram',
            access_token: decryptedAccount.access_token || '',
            metadata: decryptedAccount.metadata,
        };
    }

    return null;
}

// ============================================
// Idempotency
// ============================================

async function checkIdempotency(eventKey: string, workspaceId: string, eventType: string): Promise<boolean> {
    const { error } = await supabaseAdmin
        .from('webhook_events')
        .insert({
            event_key: eventKey,
            workspace_id: workspaceId,
            event_type: eventType,
        });

    // If insert fails due to unique constraint, it's a duplicate
    if (error) {
        if (error.code === '23505') { // Unique violation
            return true;
        }
        console.error('[WEBHOOK] Idempotency check error:', error);
        // On other errors, allow processing (fail open)
        return false;
    }

    return false; // Not a duplicate, inserted successfully
}

async function invokeAutomationOrchestrator(payload: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin.functions.invoke('automation-orchestrator', {
        body: payload,
    });

    if (error) {
        throw new Error(`Automation orchestrator failed: ${error.message || error}`);
    }

    return data;
}

// ============================================
// Comment Handler
// ============================================

async function handleCommentEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const media = value?.media as Record<string, unknown> | undefined;
    const from = value?.from as Record<string, unknown> | undefined;
    const commenterId = (from?.id as string | undefined) || '';
    // Prevent automation loops when our own Instagram reply returns as a webhook event.
    if (commenterId && commenterId === account.account_id) {
        console.log('[WEBHOOK] Ignoring self-authored comment event', {
            commentId: value?.id,
            postId: media?.id,
            commenterId,
            platform: account.platform,
        });
        return;
    }

    console.log('[WEBHOOK] Comment event:', {
        commentId: value?.id,
        postId: media?.id,
        from: from?.username,
        text: typeof value?.text === 'string' ? value.text.substring(0, 50) : undefined,
    });

    const webhookContext = {
        comment_id: value?.id,
        post_id: media?.id,
        // Instagram sends media_product_type (FEED | REELS | ...) on comment
        // webhooks. Used by post/Reel
        // trigger scoping in the orchestrator.
        media_type: media?.media_product_type || undefined,
        commenter_id: commenterId || undefined,
        commenter_username: from?.username,
        comment_text: value?.text,
        timestamp: value?.created_time,
    };

    // Canvas automations now flow through the orchestrator.
    const orchestratorResult = await invokeAutomationOrchestrator({
        workspace_id: account.workspace_id,
        social_account_id: account.social_account_id,
        trigger_type: 'trigger_new_comment',
        event_type: 'comment',
        source: 'webhook',
        webhook_context: webhookContext,
    });

    // Keep wizard flow unchanged by delegating comment processing to legacy function only.
    const { data: wizardData, error: wizardError } = await supabaseAdmin.functions.invoke('process-automations', {
        body: {
            workspace_id: account.workspace_id,
            target_editor_version: 'wizard',
            webhook_context: webhookContext,
        },
    });

    if (wizardError) {
        console.error('[WEBHOOK] Wizard automation trigger error:', wizardError);
        throw new Error(`Wizard automation trigger failed: ${wizardError.message || wizardError}`);
    }

    console.log('[WEBHOOK] Comment automation triggered:', {
        orchestrator: orchestratorResult,
        wizard: wizardData,
    });
}

// ============================================
// Message Handler
// ============================================

// ============================================
// New Trigger Handlers (for canvas automations)
// ============================================

async function handleMessageAutomationTrigger(value: Record<string, unknown>, account: ResolvedAccount) {
    const automationEvents = buildInstagramMessagingAutomationEvents(value, account);
    if (automationEvents.length === 0) return;

    for (const event of automationEvents) {
        try {
            await invokeAutomationOrchestrator({
                workspace_id: account.workspace_id,
                social_account_id: account.social_account_id,
                trigger_type: event.triggerType,
                event_type: event.eventType,
                source: 'webhook',
                webhook_context: event.context,
            });
        } catch (error) {
            console.error(`[WEBHOOK] ${event.triggerType} automation trigger error:`, error);
        }
    }
}

async function handleStoryMentionEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    console.log('[WEBHOOK] Story mention event received but trigger is temporarily disabled:', {
        platform: account.platform,
        value,
    });
}

async function handleStoryReplyEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    console.log('[WEBHOOK] Story reply event:', value);

    const messagingStoryEvents = buildInstagramMessagingAutomationEvents(value, account)
        .filter((event) => event.triggerType === 'trigger_story_reply');

    if (messagingStoryEvents.length > 0) {
        for (const event of messagingStoryEvents) {
            try {
                await invokeAutomationOrchestrator({
                    workspace_id: account.workspace_id,
                    social_account_id: account.social_account_id,
                    trigger_type: event.triggerType,
                    event_type: event.eventType,
                    source: 'webhook',
                    webhook_context: event.context,
                });
            } catch (error) {
                console.error('[WEBHOOK] Story reply automation trigger error:', error);
            }
        }
        return;
    }

    const from = value?.from as Record<string, unknown> | undefined;
    const senderId = from?.id as string | undefined;
    const messageText = value?.text as string | undefined;
    if (!senderId && !messageText) return;

    try {
        await invokeAutomationOrchestrator({
            workspace_id: account.workspace_id,
            social_account_id: account.social_account_id,
            trigger_type: 'trigger_story_reply',
            event_type: 'story_reply',
            source: 'webhook',
            webhook_context: {
                sender_id: senderId,
                message_text: messageText || '',
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[WEBHOOK] Story reply automation trigger error:', error);
    }
}

async function handleMessageEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const sender = value?.sender as Record<string, unknown> | undefined;
    const recipient = value?.recipient as Record<string, unknown> | undefined;
    const from = value?.from as Record<string, unknown> | undefined;
    const message = value?.message as Record<string, unknown> | undefined;
    const accountId = account.account_id;
    const senderId = (sender?.id || from?.id) as string | undefined;
    const recipientId = recipient?.id as string | undefined;
    const isFromAccount = !!senderId && senderId === accountId;
    const participantId =
        senderId && senderId !== accountId
            ? senderId
            : (recipientId && recipientId !== accountId ? recipientId : undefined);
    const messageId = (message?.mid || value?.id) as string | undefined;
    const messageText = (message?.text || value?.text) as string | undefined;
    const timestampMs = Number(value?.timestamp || 0);
    const platformCreatedAt = Number.isFinite(timestampMs) && timestampMs > 0
        ? new Date(timestampMs).toISOString()
        : new Date().toISOString();

    console.log('[WEBHOOK] Message event:', {
        senderId,
        recipientId,
        messageId,
        participantId,
        text: typeof messageText === 'string' ? messageText.substring(0, 50) : undefined,
    });
    logInstagramMessageWebhookDebug(value);

    // Best-effort persistence so we can render attachments/shares that Meta may omit in historical fetches.
    // This is intentionally non-fatal; webhook processing should continue even if local persistence fails.
    try {
        const normalizePayloadList = (raw: unknown): unknown[] => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            if (typeof raw === 'object') {
                const container = raw as Record<string, unknown>;
                if (Array.isArray(container.data)) return container.data;
                if (container.data && typeof container.data === 'object') return [container.data];
                return [raw];
            }
            return [];
        };

        const rawAttachments: unknown = message?.attachments || value?.attachments;
        const rawShares: unknown = message?.shares || message?.share || value?.shares || value?.share;
        const attachments = normalizePayloadList(rawAttachments);
        const shares = normalizePayloadList(rawShares).map((share) => ({
            type: 'share',
            payload: share,
        }));
        const persistedPayload = [...attachments, ...shares];

        if (messageId && participantId) {
            let conversation: { id: string; platform_conversation_id: string | null } | null = null;

            const { data: existingConv } = await supabaseAdmin
                .from('conversations')
                .select('id, platform_conversation_id')
                .eq('workspace_id', account.workspace_id)
                .eq('social_account_id', account.social_account_id)
                .eq('participant_id', participantId)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            conversation = existingConv;

            if (!conversation) {
                const platformConversationId =
                    ((value?.conversation as Record<string, unknown> | undefined)?.id as string | undefined) ||
                    ((message?.conversation as Record<string, unknown> | undefined)?.id as string | undefined);

                if (platformConversationId) {
                    const participantUsername = !isFromAccount
                        ? ((sender?.username || from?.username || from?.name) as string | undefined)
                        : undefined;

                    const { data: upsertedConv, error: upsertConvError } = await supabaseAdmin
                        .from('conversations')
                        .upsert({
                            workspace_id: account.workspace_id,
                            social_account_id: account.social_account_id,
                            platform_conversation_id: platformConversationId,
                            participant_id: participantId,
                            participant_username: participantUsername || null,
                            last_message_at: platformCreatedAt,
                            unread_count: 0,
                        }, { onConflict: 'workspace_id,platform_conversation_id' })
                        .select('id, platform_conversation_id')
                        .single();

                    if (upsertConvError) {
                        console.warn('[WEBHOOK] Message conversation upsert skipped:', upsertConvError.message);
                    } else {
                        conversation = upsertedConv;
                    }
                }
            }

            if (conversation?.id) {
                const { error: upsertMsgError } = await supabaseAdmin
                    .from('messages')
                    .upsert({
                        workspace_id: account.workspace_id,
                        conversation_id: conversation.id,
                        platform_message_id: messageId,
                        sender_id: senderId || '',
                        is_from_page: isFromAccount,
                        message: messageText || null,
                        attachments: persistedPayload,
                        is_read: isFromAccount,
                        platform_created_at: platformCreatedAt,
                    }, { onConflict: 'workspace_id,platform_message_id' });

                if (upsertMsgError) {
                    console.warn('[WEBHOOK] Message persistence upsert failed:', upsertMsgError.message);
                } else {
                    await supabaseAdmin
                        .from('conversations')
                        .update({ last_message_at: platformCreatedAt })
                        .eq('id', conversation.id);
                }
            }
        }
    } catch (persistError) {
        console.warn('[WEBHOOK] Message persistence best-effort failed:', persistError);
    }

    // Broadcast via Supabase Realtime (HTTP endpoint) to refresh the client's message list
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = supabaseServiceKey;
    await fetch(`${supabaseUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
            messages: [{
                topic: `realtime:messages:${account.workspace_id}`,
                event: 'new_message',
                payload: {
                    workspace_id: account.workspace_id,
                    platform: account.platform,
                    sender_id: (sender?.id || from?.id) as string | undefined,
                    timestamp: new Date().toISOString(),
                },
            }],
        }),
    });

    console.log('[WEBHOOK] Message broadcast sent to channel:', `messages:${account.workspace_id}`);
}
