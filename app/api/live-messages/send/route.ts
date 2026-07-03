import { NextRequest, NextResponse } from 'next/server';
import { canManageMessagesWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { createClient } from '@/utils/supabase/server';
import { getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { MAX_OUTBOUND_MESSAGE_LENGTH, requiredMessagingPermissions, sendMetaTextMessage } from '@/lib/meta-messaging';
import { assertJsonBodySize } from '@/lib/security/phase1-validation';
import { enforceRateLimit, getClientIp, RateLimitExceededError } from '@/lib/security/rate-limit';
import { redactSensitiveLogValue } from '@/lib/security/redaction';

const MAX_SEND_BODY_BYTES = 64 * 1024;

// POST - Send a message reply via Meta API
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Mutations require an explicit, membership-verified workspace selection
        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No valid workspace selected' }, { status: 400 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        assertJsonBodySize(request, MAX_SEND_BODY_BYTES);
        const body = await request.json();
        const { recipientId, message, platform } = body;

        if (!recipientId || typeof message !== 'string' || !message.trim() || !platform) {
            return NextResponse.json(
                { error: 'recipientId, message, and platform are required' },
                { status: 400 }
            );
        }
        if (message.length > MAX_OUTBOUND_MESSAGE_LENGTH) {
            return NextResponse.json(
                { error: `Message must be at most ${MAX_OUTBOUND_MESSAGE_LENGTH} characters` },
                { status: 400 }
            );
        }

        await enforceRateLimit(
            { scope: 'messages:send:user', subject: `${user.id}:${activeWorkspace.id}`, limit: 30, windowSeconds: 60 },
            'Too many messages sent. Please wait a moment and try again.'
        );
        await enforceRateLimit(
            { scope: 'messages:send:ip', subject: getClientIp(request), limit: 60, windowSeconds: 60 },
            'Too many messages sent. Please wait a moment and try again.'
        );

        // Get the social account
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        if (!canManageMessagesWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return NextResponse.json(
                {
                    error: 'Messaging is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: requiredMessagingPermissions(platform),
                    requiresReconnect: false,
                },
                { status: 403 }
            );
        }

        // For Instagram, use the Page ID for sending messages
        const pageId = platform === 'instagram'
            ? (decryptedAccount.metadata?.connected_page_id || decryptedAccount.account_id)
            : decryptedAccount.account_id;

        const result = await sendMetaTextMessage({
            pageId,
            recipientId,
            text: message,
            accessToken: decryptedAccount.access_token,
            platform,
        });

        if (!result.ok) {
            const normalized = normalizeMetaGraphError(result.error, {
                feature: 'messages',
                platform,
                operation: 'send_message',
            });
            return NextResponse.json(
                {
                    error: normalized.message,
                    errorCode: normalized.code,
                    missingPermissions: normalized.missingPermissions,
                    requiresReconnect: normalized.requiresReconnect,
                    metaError: normalized.meta,
                },
                { status: normalized.httpStatus }
            );
        }

        return NextResponse.json({
            success: true,
            messageId: result.messageId,
        });

    } catch (error: any) {
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message, errorCode: 'rate_limited' },
                { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error.message || 'Forbidden', errorCode: 'forbidden' },
                { status: permissionStatus }
            );
        }
        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message, errorCode: 'invalid_request' }, { status: 400 });
        }
        console.error('Send message API error:', redactSensitiveLogValue(error));
        return NextResponse.json(
            { error: error.message || 'Failed to send message', errorCode: 'internal_error' },
            { status: 500 }
        );
    }
}
