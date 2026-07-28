import { NextRequest, NextResponse } from 'next/server';
import { canManageMessagesWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { getWorkspacePermissionErrorStatus, hasWorkspacePermission, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { MAX_OUTBOUND_MESSAGE_LENGTH, requiredMessagingPermissions, sendMetaTextMessage } from '@/lib/meta-messaging';
import { assertJsonBodySize } from '@/lib/security/phase1-validation';
import { enforceRateLimit, getClientIp, RateLimitExceededError } from '@/lib/security/rate-limit';
import { redactSensitiveLogValue } from '@/lib/security/redaction';

const MAX_SEND_BODY_BYTES = 64 * 1024;

// GET - List conversations or messages
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Reads may fall back to the first workspace, but the mark-read writes
        // below require an explicit, membership-verified workspace selection.
        const explicitWorkspace = await getExplicitActiveWorkspace();
        const activeWorkspace = explicitWorkspace ?? await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        const workspaceRole = await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read');
        const canMutateMessageState = explicitWorkspace !== null && hasWorkspacePermission(workspaceRole, 'content:write');

        // Parse query params
        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get('conversationId');
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const offset = (page - 1) * limit;

        if (conversationId) {
            // Fetch messages for a specific conversation
            const { data: messages, error, count } = await supabase
                .from('messages')
                .select('*', { count: 'exact' })
                .eq('conversation_id', conversationId)
                .eq('workspace_id', activeWorkspace.id)
                .order('platform_created_at', { ascending: true })
                .range(offset, offset + limit - 1);

            if (error) {
                throw error;
            }

            // Mark messages as read (workspace-scoped writes)
            if (canMutateMessageState) {
                await supabase
                    .from('messages')
                    .update({ is_read: true })
                    .eq('conversation_id', conversationId)
                    .eq('workspace_id', activeWorkspace.id)
                    .eq('is_read', false);

                // Update conversation unread count
                await supabase
                    .from('conversations')
                    .update({ unread_count: 0 })
                    .eq('id', conversationId)
                    .eq('workspace_id', activeWorkspace.id);
            }

            return NextResponse.json({
                messages,
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limit)
                }
            });
        } else {
            // Fetch all conversations
            const { data: conversations, error, count } = await supabase
                .from('conversations')
                .select('*, social_accounts(platform, account_name)', { count: 'exact' })
                .eq('workspace_id', activeWorkspace.id)
                .order('last_message_at', { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) {
                throw error;
            }

            // Fetch the last message for each conversation
            const conversationsWithLastMessage = await Promise.all(
                (conversations || []).map(async (conv) => {
                    const { data: lastMessage } = await supabase
                        .from('messages')
                        .select('*')
                        .eq('conversation_id', conv.id)
                        .eq('workspace_id', activeWorkspace.id)
                        .order('platform_created_at', { ascending: false })
                        .limit(1)
                        .single();

                    return {
                        ...conv,
                        lastMessage
                    };
                })
            );

            return NextResponse.json({
                conversations: conversationsWithLastMessage,
                pagination: {
                    page,
                    limit,
                    total: count || 0,
                    totalPages: Math.ceil((count || 0) / limit)
                },
                workspaceId: activeWorkspace.id
            });
        }

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch messages';
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: errorMessage },
                { status: permissionStatus }
            );
        }
        console.error('Get messages API error:', error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

// POST - Send a message reply
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
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
        const { conversationId, message } = body;

        if (!conversationId || typeof message !== 'string' || !message.trim()) {
            return NextResponse.json(
                { error: 'conversationId and message are required' },
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

        // Get the conversation details
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('*, social_accounts(*)')
            .eq('id', conversationId)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (convError || !conversation) {
            return NextResponse.json(
                { error: 'Conversation not found' },
                { status: 404 }
            );
        }

        const account = conversation.social_accounts ? decryptMetaAccountRow(conversation.social_accounts) : null;
        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        if (!canManageMessagesWithMetaAccount(
            account.metadata,
            account.platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return NextResponse.json(
                {
                    error: 'Messaging is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: requiredMessagingPermissions(account.platform || 'instagram'),
                    requiresReconnect: false,
                },
                { status: 403 }
            );
        }

        // Send message via Meta API
        // Instagram messaging requires the Page ID, not the IG user ID
        const pageId = account.metadata?.connected_page_id || account.account_id;
        const result = await sendMetaTextMessage({
            pageId,
            recipientId: conversation.participant_id,
            text: message,
            accessToken: account.access_token,
            platform: account.platform || 'instagram',
        });

        if (!result.ok) {
            throw new Error((result.error?.message as string | undefined) || 'Failed to send message');
        }

        // Store the sent message locally
        const messageRecord = {
            workspace_id: activeWorkspace.id,
            conversation_id: conversation.id,
            platform_message_id: result.messageId || `local_${Date.now()}`,
            sender_id: pageId,
            is_from_page: true,
            message,
            is_read: true,
            platform_created_at: new Date().toISOString()
        };

        const { data: savedMessage, error: msgError } = await supabase
            .from('messages')
            .insert(messageRecord)
            .select()
            .single();

        if (msgError) {
            console.error('Failed to save sent message:', msgError);
        }

        // Update conversation last_message_at
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', conversationId)
            .eq('workspace_id', activeWorkspace.id);

        return NextResponse.json({
            success: true,
            messageId: result.messageId,
            message: savedMessage
        });

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
        if (error instanceof RateLimitExceededError) {
            return NextResponse.json(
                { error: error.message },
                { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } }
            );
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: errorMessage },
                { status: permissionStatus }
            );
        }
        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('Send message API error:', redactSensitiveLogValue(error));
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}
