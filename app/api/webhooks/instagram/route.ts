import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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
 * 3. Resolve workspace/account from event IDs
 * 4. Route to comment or message handler
 * 5. Return 200 immediately
 */
export async function POST(request: NextRequest) {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret) {
        console.error('[WEBHOOK] Missing META_APP_SECRET');
        return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
    }

    // Step 1: Read raw body and verify signature
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!signature) {
        console.warn('[WEBHOOK] Missing X-Hub-Signature-256 header');
        return new NextResponse('Missing signature', { status: 401 });
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', appSecret)
        .update(rawBody)
        .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        console.warn('[WEBHOOK] Signature verification failed');
        return new NextResponse('Invalid signature', { status: 401 });
    }

    // Step 2: Parse the event payload
    let body: any;
    try {
        body = JSON.parse(rawBody);
    } catch {
        console.error('[WEBHOOK] Failed to parse JSON body');
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('[WEBHOOK] Event received:', JSON.stringify(body).substring(0, 500));

    // Step 3: Process events asynchronously but return 200 immediately
    // Meta expects a fast 200 response; processing happens after
    processWebhookEvents(body).catch(err => {
        console.error('[WEBHOOK] Error processing events:', err);
    });

    return NextResponse.json({ received: true }, { status: 200 });
}

// ============================================
// Event Processing (runs after 200 response)
// ============================================

async function processWebhookEvents(body: any) {
    if (body.object !== 'instagram' && body.object !== 'page') {
        console.log(`[WEBHOOK] Ignoring object type: ${body.object}`);
        return;
    }

    for (const entry of body.entry || []) {
        const entryId = entry.id; // Page ID or IG Business Account ID

        // Resolve which workspace/account this event belongs to
        const account = await resolveAccount(entryId);
        if (!account) {
            console.warn(`[WEBHOOK] No account found for entry ID: ${entryId}`);
            continue;
        }

        console.log(`[WEBHOOK] Resolved account: workspace=${account.workspace_id}, platform=${account.platform}`);

        // Process changes within this entry
        for (const change of entry.changes || []) {
            const eventKey = `${entryId}:${change.field}:${change.value?.id || Date.now()}`;

            // Idempotency check
            const isDuplicate = await checkIdempotency(eventKey, account.workspace_id, change.field);
            if (isDuplicate) {
                console.log(`[WEBHOOK] Duplicate event skipped: ${eventKey}`);
                continue;
            }

            switch (change.field) {
                case 'comments':
                    await handleCommentEvent(change.value, account);
                    break;
                case 'messages':
                    await handleMessageEvent(change.value, account);
                    break;
                case 'mentions':
                    console.log(`[WEBHOOK] Mention event (not processed):`, change.value);
                    break;
                default:
                    console.log(`[WEBHOOK] Unknown field: ${change.field}`);
            }
        }

        // Also handle direct messaging entries (messaging array, not changes)
        for (const messaging of entry.messaging || []) {
            const eventKey = `${entryId}:messaging:${messaging.message?.mid || Date.now()}`;

            const isDuplicate = await checkIdempotency(eventKey, account.workspace_id, 'messaging');
            if (isDuplicate) {
                console.log(`[WEBHOOK] Duplicate messaging event skipped: ${eventKey}`);
                continue;
            }

            await handleMessageEvent(messaging, account);
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
    metadata: Record<string, any> | null;
}

async function resolveAccount(entryId: string): Promise<ResolvedAccount | null> {
    // Strategy 1: Match by account_id (IG Business Account ID)
    const { data: account } = await supabaseAdmin
        .from('social_accounts')
        .select('id, workspace_id, account_id, platform, access_token, metadata')
        .eq('account_id', entryId)
        .maybeSingle();

    if (account) {
        return {
            workspace_id: account.workspace_id,
            social_account_id: account.id,
            account_id: account.account_id,
            platform: account.platform,
            access_token: account.access_token,
            metadata: account.metadata,
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
                return {
                    workspace_id: acc.workspace_id,
                    social_account_id: acc.id,
                    account_id: acc.account_id,
                    platform: acc.platform,
                    access_token: acc.access_token,
                    metadata: acc.metadata,
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

// ============================================
// Comment Handler
// ============================================

async function handleCommentEvent(value: any, account: ResolvedAccount) {
    console.log('[WEBHOOK] Comment event:', {
        commentId: value?.id,
        postId: value?.media?.id,
        from: value?.from?.username,
        text: value?.text?.substring(0, 50),
    });

    try {
        // Trigger the automation engine for this specific workspace + post
        const { data, error } = await supabaseAdmin.functions.invoke('process-automations', {
            body: {
                workspace_id: account.workspace_id,
                // Pass webhook context so the Edge Function can target the specific post
                webhook_context: {
                    comment_id: value?.id,
                    post_id: value?.media?.id,
                    commenter_id: value?.from?.id,
                    commenter_username: value?.from?.username,
                    comment_text: value?.text,
                    timestamp: value?.created_time,
                },
            },
        });

        if (error) {
            console.error('[WEBHOOK] Automation trigger error:', error);
        } else {
            console.log('[WEBHOOK] Automation triggered:', data);
        }
    } catch (err) {
        console.error('[WEBHOOK] Failed to trigger automation:', err);
    }
}

// ============================================
// Message Handler
// ============================================

async function handleMessageEvent(value: any, account: ResolvedAccount) {
    console.log('[WEBHOOK] Message event:', {
        senderId: value?.sender?.id || value?.from?.id,
        text: value?.message?.text?.substring(0, 50) || value?.text?.substring(0, 50),
    });

    try {
        // Broadcast via Supabase Realtime to refresh the client's message list
        const channel = supabaseAdmin.channel(`messages:${account.workspace_id}`);
        await channel.send({
            type: 'broadcast',
            event: 'new_message',
            payload: {
                workspace_id: account.workspace_id,
                platform: account.platform,
                sender_id: value?.sender?.id || value?.from?.id,
                timestamp: new Date().toISOString(),
            },
        });

        console.log('[WEBHOOK] Message broadcast sent to channel:', `messages:${account.workspace_id}`);
    } catch (err) {
        console.error('[WEBHOOK] Failed to broadcast message event:', err);
    }
}
