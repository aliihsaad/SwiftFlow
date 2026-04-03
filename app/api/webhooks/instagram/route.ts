import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { decryptMetaAccountRow } from '@/lib/meta-account';
import { isReviewPhase1Release } from '@/lib/release-channel';

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
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
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
    const candidateSecrets = [
        process.env.INSTAGRAM_APP_SECRET?.trim(),
        process.env.META_APP_SECRET?.trim(),
    ].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

    if (candidateSecrets.length === 0) {
        console.error('[WEBHOOK] Missing INSTAGRAM_APP_SECRET and META_APP_SECRET');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Step 1: Read raw body as bytes and verify signature
    const rawBuffer = Buffer.from(await request.arrayBuffer());
    const rawBody = rawBuffer.toString('utf8');
    const signature = request.headers.get('x-hub-signature-256');

    if (!signature) {
        console.warn('[WEBHOOK] Missing X-Hub-Signature-256 header');
        return new NextResponse('Missing signature', { status: 401 });
    }

    const expectedSignatures = candidateSecrets.map((secret) => ({
        source:
            secret === process.env.INSTAGRAM_APP_SECRET?.trim()
                ? 'INSTAGRAM_APP_SECRET'
                : 'META_APP_SECRET',
        value:
            'sha256=' +
            crypto.createHmac('sha256', secret).update(rawBuffer).digest('hex'),
    }));

    const matchedSignature = expectedSignatures.find((sig) => {
        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(sig.value);
        return sigBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    });

    console.log('[WEBHOOK] Signature debug:', {
        receivedPrefix: signature.substring(0, 20),
        expectedPrefixes: expectedSignatures.map((s) => `${s.source}:${s.value.substring(0, 20)}`),
        match: !!matchedSignature,
        matchedSource: matchedSignature?.source || null,
        bodyLen: rawBuffer.length,
    });

    if (!matchedSignature) {
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
    if (body.object !== 'instagram' && body.object !== 'page') {
        console.log(`[WEBHOOK] Ignoring object type: ${body.object}`);
        return;
    }

    const entries = (body.entry || []) as Record<string, unknown>[];
    for (const entry of entries) {
        const entryId = entry.id as string; // Page ID or IG Business Account ID

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
                    await handleCommentEvent(change.value as Record<string, unknown>, account);
                    break;
                case 'feed':
                    await handlePageFeedEvent(change.value as Record<string, unknown>, account);
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
    platform: string;
    access_token: string;
    metadata: Record<string, unknown> | null;
}

async function resolveAccount(entryId: string): Promise<ResolvedAccount | null> {
    // Strategy 1: Match by account_id (IG Business Account ID)
    const { data: account } = await supabaseAdmin
        .from('social_accounts')
        .select('id, workspace_id, account_id, platform, access_token, metadata')
        .eq('account_id', entryId)
        .maybeSingle();

    if (account) {
        const decryptedAccount = decryptMetaAccountRow(account);
        return {
            workspace_id: decryptedAccount.workspace_id,
            social_account_id: decryptedAccount.id,
            account_id: decryptedAccount.account_id,
            platform: decryptedAccount.platform,
            access_token: decryptedAccount.access_token || '',
            metadata: decryptedAccount.metadata,
        };
    }

    // Strategy 2: Match by connected_page_id in metadata (for page-scoped events)
    const { data: accounts } = await supabaseAdmin
        .from('social_accounts')
        .select('id, workspace_id, account_id, platform, access_token, metadata')
        .not('metadata', 'is', null);

    if (accounts) {
        for (const acc of accounts) {
            if (acc.metadata?.connected_page_id === entryId) {
                const decryptedAccount = decryptMetaAccountRow(acc);
                return {
                    workspace_id: decryptedAccount.workspace_id,
                    social_account_id: decryptedAccount.id,
                    account_id: decryptedAccount.account_id,
                    platform: decryptedAccount.platform,
                    access_token: decryptedAccount.access_token || '',
                    metadata: decryptedAccount.metadata,
                };
            }
        }
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

function normalizeFacebookFeedCommentValue(value: Record<string, unknown>): Record<string, unknown> | null {
    const item = String(value?.item || '').toLowerCase();
    const verb = String(value?.verb || '').toLowerCase();

    // Page feed includes many event types; only route new comments into comment automations.
    if (item !== 'comment') return null;
    if (verb && verb !== 'add') return null;

    const from = (value?.from as Record<string, unknown> | undefined) || {};
    const commentId = (value?.comment_id || value?.id) as string | undefined;
    const postId =
        (value?.post_id as string | undefined) ||
        ((value?.post as Record<string, unknown> | undefined)?.id as string | undefined) ||
        (value?.parent_id as string | undefined);

    // Meta may use `message` for page feed comments, unlike Instagram `comments` field events (which use `text`)
    const text =
        (value?.message as string | undefined) ??
        (value?.text as string | undefined) ??
        (value?.comment as string | undefined) ??
        '';

    if (!commentId || !postId) {
        console.log('[WEBHOOK] Ignoring page feed comment event with missing IDs', {
            item,
            verb,
            commentId,
            postId,
            keys: Object.keys(value || {}),
        });
        return null;
    }

    return {
        id: commentId,
        media: { id: postId },
        from: {
            id: (from?.id || value?.sender_id || value?.from_id) as string | undefined,
            username: (from?.username || from?.name || value?.sender_name || value?.from_name) as string | undefined,
        },
        text,
        created_time: (value?.created_time || value?.time || new Date().toISOString()) as string | number,
    };
}

async function handlePageFeedEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const normalizedComment = normalizeFacebookFeedCommentValue(value);
    if (!normalizedComment) {
        console.log('[WEBHOOK] Ignored page feed event (non-comment or unsupported)', {
            item: value?.item,
            verb: value?.verb,
        });
        return;
    }

    console.log('[WEBHOOK] Page feed comment event:', {
        item: value?.item,
        verb: value?.verb,
        commentId: normalizedComment?.id,
        postId: (normalizedComment?.media as Record<string, unknown> | undefined)?.id,
    });

    await handleCommentEvent(normalizedComment, account);
}

async function handleCommentEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const media = value?.media as Record<string, unknown> | undefined;
    const from = value?.from as Record<string, unknown> | undefined;
    const commenterId = (from?.id as string | undefined) || '';
    const selfActorIds = new Set(
        [
            account.account_id,
            account.metadata?.connected_page_id as string | undefined,
            account.metadata?.page_id as string | undefined,
        ].filter(Boolean) as string[]
    );

    // Prevent automation loops when our own page/account reply comment is received back as a webhook event.
    if (commenterId && selfActorIds.has(commenterId)) {
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
    const sender = value?.sender as Record<string, unknown> | undefined;
    const from = value?.from as Record<string, unknown> | undefined;
    const message = value?.message as Record<string, unknown> | undefined;
    const senderId = (sender?.id || from?.id) as string | undefined;
    const messageText = (message?.text || value?.text) as string | undefined;
    const messageId = (message?.mid || value?.id) as string | undefined;
    const hasAttachmentPayload =
        !!(message && 'attachments' in message && message.attachments) ||
        !!(value && 'attachments' in value && value.attachments);

    // Allow "any message" triggers for attachment/share messages even when Meta omits text.
    // Keyword triggers will still fail to match because message_text becomes an empty string.
    if (!senderId || (!messageText && !messageId && !hasAttachmentPayload)) return;

    try {
        await invokeAutomationOrchestrator({
            workspace_id: account.workspace_id,
            social_account_id: account.social_account_id,
            trigger_type: 'trigger_new_message',
            event_type: 'message',
            source: 'webhook',
            webhook_context: {
                sender_id: senderId,
                sender_username: (sender?.username || from?.username) as string,
                message_text: messageText || '',
                message_id: messageId,
                message_has_attachments: hasAttachmentPayload,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[WEBHOOK] Message automation trigger error:', error);
    }
}

async function handleStoryMentionEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    console.log('[WEBHOOK] Story mention event received but trigger is temporarily disabled:', value);
}

async function handleStoryReplyEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    console.log('[WEBHOOK] Story reply event:', value);

    try {
        await invokeAutomationOrchestrator({
            workspace_id: account.workspace_id,
            social_account_id: account.social_account_id,
            trigger_type: 'trigger_story_reply',
            event_type: 'story_reply',
            source: 'webhook',
            webhook_context: {
                sender_id: (value?.from as Record<string, unknown>)?.id as string,
                message_text: value?.text as string,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[WEBHOOK] Story reply automation trigger error:', error);
    }
}

// ============================================
// Follower Handler (from messaging entries)
// ============================================

async function handleFollowEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const followerId = (value?.from as Record<string, unknown>)?.id as string;

    if (!followerId) return;

    try {
        await invokeAutomationOrchestrator({
            workspace_id: account.workspace_id,
            social_account_id: account.social_account_id,
            trigger_type: 'trigger_new_follower',
            event_type: 'follower',
            source: 'webhook',
            webhook_context: {
                follower_id: followerId,
                follower_username: (value?.from as Record<string, unknown>)?.username as string,
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[WEBHOOK] Follower automation trigger error:', error);
    }
}

async function handleMessageEvent(value: Record<string, unknown>, account: ResolvedAccount) {
    const sender = value?.sender as Record<string, unknown> | undefined;
    const recipient = value?.recipient as Record<string, unknown> | undefined;
    const from = value?.from as Record<string, unknown> | undefined;
    const message = value?.message as Record<string, unknown> | undefined;
    const pageId = (account.metadata?.connected_page_id as string | undefined) || account.account_id;
    const senderId = (sender?.id || from?.id) as string | undefined;
    const recipientId = recipient?.id as string | undefined;
    const isFromPage = !!senderId && (senderId === pageId || senderId === account.account_id);
    const participantId =
        senderId && senderId !== pageId && senderId !== account.account_id
            ? senderId
            : (recipientId && recipientId !== pageId && recipientId !== account.account_id ? recipientId : undefined);
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
        const normalizePayloadList = (raw: any): any[] => {
            if (!raw) return [];
            if (Array.isArray(raw)) return raw;
            if (Array.isArray(raw.data)) return raw.data;
            if (raw.data && typeof raw.data === 'object') return [raw.data];
            if (typeof raw === 'object') return [raw];
            return [];
        };

        const rawAttachments = (message?.attachments || value?.attachments) as any;
        const rawShares = (message?.shares || message?.share || value?.shares || value?.share) as any;
        const attachments = normalizePayloadList(rawAttachments);
        const shares = normalizePayloadList(rawShares).map((share) => ({
            type: 'share',
            payload: share,
        }));
        const persistedPayload = [...attachments, ...shares];

        if (messageId && participantId) {
            let conversation: any = null;

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
                    const participantUsername = !isFromPage
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
                        is_from_page: isFromPage,
                        message: messageText || null,
                        attachments: persistedPayload,
                        is_read: isFromPage,
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
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;
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
