import { NextRequest, NextResponse } from 'next/server';
import { canManageMessagesWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors';

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

function isAttachmentPlaceholderMessage(value: unknown): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === '[attachment]' || normalized === 'attachment';
}

function normalizeMetaAttachments(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.data)) return raw.data;
    if (raw.data && typeof raw.data === 'object') return [raw.data];
    if (typeof raw === 'object') return [raw];
    return [];
}

function serializeMetaAttachments(raw: any): string {
    const normalized = normalizeMetaAttachments(raw);
    return normalized.length > 0 ? JSON.stringify(normalized) : '[]';
}

function parseStoredAttachments(attachments: any): any[] {
    if (!attachments) return [];
    if (Array.isArray(attachments)) return attachments;
    if (typeof attachments === 'string') {
        try {
            const parsed = JSON.parse(attachments);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function isEmptySerializedAttachments(value: string | null | undefined): boolean {
    if (!value) return true;
    try {
        const parsed = JSON.parse(value);
        return !Array.isArray(parsed) || parsed.length === 0;
    } catch {
        return true;
    }
}

function messagingCapabilitiesFromError(errorCode: string | null, missingPermissions: string[] = []) {
    if (errorCode === 'meta_missing_permission') {
        return {
            canReadMessages: false,
            canSendMessages: false,
            reason: 'missing_permission',
            missingPermissions,
        };
    }
    if (errorCode === 'meta_auth_invalid_token') {
        return {
            canReadMessages: false,
            canSendMessages: false,
            reason: 'token_invalid',
            missingPermissions,
        };
    }
    return {
        canReadMessages: true,
        canSendMessages: true,
        reason: null,
        missingPermissions,
    };
}

function requiredMessagingPermissions(platform: string): string[] {
    return platform === 'facebook' ? ['pages_messaging'] : ['instagram_manage_messages'];
}

function messagingCapabilitiesFromAccount(platform: string, canManageMessages: boolean) {
    return canManageMessages
        ? messagingCapabilitiesFromError(null)
        : messagingCapabilitiesFromError('meta_missing_permission', requiredMessagingPermissions(platform));
}

// GET - List conversations or fetch messages for a specific conversation, live from Meta API
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const platform = searchParams.get('platform') || 'instagram';
        const conversationId = searchParams.get('conversationId');

        // Determine which account to use
        // For Instagram DMs, we need the IG account but use the Page ID for the API
        // For Facebook messages, we use the Facebook page directly
        let accountPlatform = platform;

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', accountPlatform)
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                {
                    error: `No ${platform} account connected`,
                    errorCode: 'no_account_connected',
                    conversations: [],
                    messagingCapabilities: {
                        canReadMessages: false,
                        canSendMessages: false,
                        reason: 'no_account_connected',
                        missingPermissions: [],
                    },
                },
                { status: 200 }
            );
        }
        const decryptedAccount = decryptMetaAccountRow(account);
        const canManageMessages = canManageMessagesWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        );

        if (!decryptedAccount.access_token) {
            return NextResponse.json(
                { error: 'No access token available' },
                { status: 400 }
            );
        }

        if (!canManageMessages) {
            const messagingCapabilities = messagingCapabilitiesFromAccount(platform, false);

            if (conversationId) {
                return NextResponse.json({
                    messages: [],
                    pageId: platform === 'instagram'
                        ? (decryptedAccount.metadata?.connected_page_id || decryptedAccount.account_id)
                        : decryptedAccount.account_id,
                    error: 'Messaging is not available for this connected account',
                    errorCode: 'meta_missing_permission',
                    missingPermissions: messagingCapabilities.missingPermissions,
                    requiresReconnect: false,
                    messagingCapabilities,
                });
            }

            return NextResponse.json({
                conversations: [],
                error: 'Messaging is not available for this connected account',
                errorCode: 'meta_missing_permission',
                missingPermissions: messagingCapabilities.missingPermissions,
                requiresReconnect: false,
                account: { id: decryptedAccount.id, account_name: decryptedAccount.account_name, platform },
                workspaceId: activeWorkspace.id,
                pageId: platform === 'instagram'
                    ? (decryptedAccount.metadata?.connected_page_id || decryptedAccount.account_id)
                    : decryptedAccount.account_id,
                messagingCapabilities,
            });
        }

        // For Instagram, we need the connected Page ID (messaging goes through Pages API)
        const pageId = platform === 'instagram'
            ? (decryptedAccount.metadata?.connected_page_id || decryptedAccount.account_id)
            : decryptedAccount.account_id;

        if (conversationId) {
            // ──────────────────────────────────────────────
            // MODE: Fetch messages for a specific conversation
            // ──────────────────────────────────────────────
            // Request rich attachment fields so the UI can render image/file/post-share attachments.
            const messagesUrl = `${META_GRAPH_URL}/${conversationId}/messages?fields=id,message,from,created_time,attachments{mime_type,size,name,image_data,file_url,video_data,audio_data,payload,url}&limit=50&access_token=${decryptedAccount.access_token}`;

            console.log(`[LiveMessages] Fetching messages for conversation ${conversationId}`);
            const response = await fetch(messagesUrl);
            const data = await response.json();

            if (!response.ok) {
                console.error('[LiveMessages] Messages API error:', data.error);
                const normalized = normalizeMetaGraphError(data?.error, {
                    feature: 'messages',
                    platform,
                    operation: 'read_messages',
                });
                return NextResponse.json(
                    {
                        error: normalized.message,
                        errorCode: normalized.code,
                        missingPermissions: normalized.missingPermissions,
                        requiresReconnect: normalized.requiresReconnect,
                        messages: [],
                        pageId,
                        messagingCapabilities: messagingCapabilitiesFromError(normalized.code, normalized.missingPermissions),
                        metaError: normalized.meta,
                    },
                    { status: normalized.httpStatus }
                );
            }

            const messages = (data.data || []).map((msg: any) => ({
                id: msg.id,
                platform_message_id: msg.id,
                sender_id: msg.from?.id || '',
                sender_name: msg.from?.username || msg.from?.name || msg.from?.id || 'Unknown',
                is_from_page: msg.from?.id === pageId || msg.from?.id === decryptedAccount.account_id,
                message: msg.message || null,
                attachments: serializeMetaAttachments(msg.attachments),
                platform_created_at: msg.created_time,
                is_read: true,
            }));

            // Merge local webhook/sync payloads (if available) to recover attachments Meta omits in historical fetches.
            const platformMessageIds = messages.map((m: any) => m.platform_message_id).filter(Boolean);
            if (platformMessageIds.length > 0) {
                try {
                    const { data: localMessages, error: localError } = await supabase
                        .from('messages')
                        .select('platform_message_id, message, attachments')
                        .eq('workspace_id', activeWorkspace.id)
                        .in('platform_message_id', platformMessageIds);

                    if (localError) {
                        console.warn('[LiveMessages] Local message fallback query failed:', localError.message);
                    } else if (localMessages?.length) {
                        const localByPlatformId = new Map<string, any>();
                        localMessages.forEach((row: any) => localByPlatformId.set(row.platform_message_id, row));

                        messages.forEach((msg: any) => {
                            const local = localByPlatformId.get(msg.platform_message_id);
                            if (!local) return;

                            if ((msg.message == null || msg.message === '') && typeof local.message === 'string' && local.message.trim()) {
                                msg.message = local.message;
                            }

                            if (isEmptySerializedAttachments(msg.attachments)) {
                                const localAttachments = parseStoredAttachments(local.attachments);
                                if (localAttachments.length > 0) {
                                    msg.attachments = JSON.stringify(localAttachments);
                                }
                            }
                        });
                    }
                } catch (fallbackError) {
                    console.warn('[LiveMessages] Local fallback merge failed:', fallbackError);
                }
            }

            // Reverse to show oldest first (Meta returns newest first)
            messages.reverse();

            return NextResponse.json({
                messages,
                pageId,
                messagingCapabilities: messagingCapabilitiesFromAccount(platform, canManageMessages),
            });

        } else {
            // ──────────────────────────────────────────────
            // MODE: List all conversations
            // ──────────────────────────────────────────────
            let conversationsUrl = `${META_GRAPH_URL}/${pageId}/conversations?fields=id,participants,messages.limit(1){id,message,from,created_time,attachments{mime_type,size,name,image_data,file_url,video_data,audio_data,payload,url}},updated_time&limit=25&access_token=${decryptedAccount.access_token}`;

            // For Instagram, add platform filter
            if (platform === 'instagram') {
                conversationsUrl += '&platform=instagram';
            }

            console.log(`[LiveMessages] Fetching ${platform} conversations for page ${pageId}`);
            const response = await fetch(conversationsUrl);
            const data = await response.json();

            if (!response.ok) {
                console.error('[LiveMessages] Conversations API error:', data.error);
                const normalized = normalizeMetaGraphError(data?.error, {
                    feature: 'messages',
                    platform,
                    operation: 'list_conversations',
                });
                // For permission/auth gating, return 200 with structured capabilities so UI can render a targeted state.
                if (normalized.category === 'permission' || normalized.category === 'auth') {
                    return NextResponse.json({
                        conversations: [],
                        error: normalized.message,
                        errorCode: normalized.code,
                        missingPermissions: normalized.missingPermissions,
                        requiresReconnect: normalized.requiresReconnect,
                        account: { id: decryptedAccount.id, account_name: decryptedAccount.account_name, platform },
                        workspaceId: activeWorkspace.id,
                        pageId,
                        messagingCapabilities: messagingCapabilitiesFromError(normalized.code, normalized.missingPermissions),
                        metaError: normalized.meta,
                    });
                }
                return NextResponse.json(
                    {
                        error: normalized.message,
                        errorCode: normalized.code,
                        conversations: [],
                        account: { id: decryptedAccount.id, account_name: decryptedAccount.account_name, platform },
                        workspaceId: activeWorkspace.id,
                        pageId,
                        messagingCapabilities: messagingCapabilitiesFromAccount(platform, canManageMessages),
                        metaError: normalized.meta,
                    },
                    { status: normalized.httpStatus }
                );
            }

            const conversations = await Promise.all((data.data || []).map(async (conv: any) => {
                // Find the other participant (not the page)
                const participant = conv.participants?.data?.find(
                    (p: any) => p.id !== pageId && p.id !== decryptedAccount.account_id
                );

                let lastMsg = conv.messages?.data?.[0];
                let lastMsgAttachments = normalizeMetaAttachments(lastMsg?.attachments);

                // Meta sometimes returns "[Attachment]" in nested conversation previews without usable attachment details.
                // Hydrate the latest message directly so the UI can render a better preview label.
                if (lastMsg?.id && isAttachmentPlaceholderMessage(lastMsg?.message) && lastMsgAttachments.length === 0) {
                    try {
                        const previewMessageUrl = `${META_GRAPH_URL}/${conv.id}/messages?fields=id,message,from,created_time,attachments{mime_type,size,name,image_data,file_url,video_data,audio_data,payload,url}&limit=1&access_token=${decryptedAccount.access_token}`;
                        const previewRes = await fetch(previewMessageUrl);
                        const previewData = await previewRes.json();
                        if (previewRes.ok && Array.isArray(previewData?.data) && previewData.data.length > 0) {
                            lastMsg = previewData.data[0];
                            lastMsgAttachments = normalizeMetaAttachments(lastMsg?.attachments);
                        }
                    } catch (previewErr) {
                        console.log(`[LiveMessages] Failed to hydrate attachment preview for conversation ${conv.id}:`, previewErr);
                    }
                }

                return {
                    id: conv.id,
                    platform_conversation_id: conv.id,
                    participant_id: participant?.id || '',
                    participant_username: participant?.username || participant?.name || 'Unknown',
                    participant_profile_picture: null,
                    last_message_at: conv.updated_time || lastMsg?.created_time || '',
                    unread_count: 0, // Meta doesn't easily expose unread counts via graph API
                    social_accounts: {
                        platform,
                        account_name: decryptedAccount.account_name,
                    },
                    lastMessage: lastMsg ? {
                        id: lastMsg.id,
                        platform_message_id: lastMsg.id,
                        sender_id: lastMsg.from?.id || '',
                        is_from_page: lastMsg.from?.id === pageId || lastMsg.from?.id === decryptedAccount.account_id,
                        message: lastMsg.message || null,
                        attachments: serializeMetaAttachments(lastMsgAttachments),
                        is_read: true,
                        platform_created_at: lastMsg.created_time,
                    } : undefined,
                };
            }));

            // Merge local webhook/sync payloads (if available) for conversation preview rows.
            try {
                const platformConversationIds = conversations
                    .map((c: any) => c.platform_conversation_id)
                    .filter(Boolean);

                if (platformConversationIds.length > 0) {
                    const { data: localConversations, error: localConvError } = await supabase
                        .from('conversations')
                        .select('id, platform_conversation_id')
                        .eq('workspace_id', activeWorkspace.id)
                        .eq('social_account_id', decryptedAccount.id)
                        .in('platform_conversation_id', platformConversationIds);

                    if (localConvError) {
                        console.warn('[LiveMessages] Local conversation fallback query failed:', localConvError.message);
                    } else if (localConversations?.length) {
                        const localConvIds = localConversations.map((c: any) => c.id);
                        const localConvByPlatform = new Map<string, any>();
                        localConversations.forEach((c: any) => localConvByPlatform.set(c.platform_conversation_id, c));

                        const { data: localMessages, error: localMsgError } = await supabase
                            .from('messages')
                            .select('conversation_id, platform_message_id, message, attachments, platform_created_at')
                            .in('conversation_id', localConvIds)
                            .order('platform_created_at', { ascending: false });

                        if (localMsgError) {
                            console.warn('[LiveMessages] Local preview message fallback query failed:', localMsgError.message);
                        } else if (localMessages?.length) {
                            const latestLocalByConversationId = new Map<string, any>();
                            localMessages.forEach((msg: any) => {
                                if (!latestLocalByConversationId.has(msg.conversation_id)) {
                                    latestLocalByConversationId.set(msg.conversation_id, msg);
                                }
                            });

                            conversations.forEach((conv: any) => {
                                const localConv = localConvByPlatform.get(conv.platform_conversation_id);
                                if (!localConv) return;
                                const localMsg = latestLocalByConversationId.get(localConv.id);
                                if (!localMsg) return;

                                const currentLast = conv.lastMessage;
                                const currentHasText = !!(currentLast?.message && !isAttachmentPlaceholderMessage(currentLast.message));
                                const currentHasAttachments = !isEmptySerializedAttachments(currentLast?.attachments);

                                if (!currentHasText && typeof localMsg.message === 'string' && localMsg.message.trim()) {
                                    conv.lastMessage = {
                                        ...(currentLast || {}),
                                        id: currentLast?.id || localMsg.platform_message_id,
                                        platform_message_id: currentLast?.platform_message_id || localMsg.platform_message_id,
                                        message: localMsg.message,
                                        attachments: currentLast?.attachments || '[]',
                                        platform_created_at: currentLast?.platform_created_at || localMsg.platform_created_at,
                                    };
                                }

                                if (!currentHasAttachments) {
                                    const localAttachments = parseStoredAttachments(localMsg.attachments);
                                    if (localAttachments.length > 0) {
                                        conv.lastMessage = {
                                            ...(conv.lastMessage || {}),
                                            id: conv.lastMessage?.id || localMsg.platform_message_id,
                                            platform_message_id: conv.lastMessage?.platform_message_id || localMsg.platform_message_id,
                                            message: conv.lastMessage?.message ?? localMsg.message ?? null,
                                            attachments: JSON.stringify(localAttachments),
                                            platform_created_at: conv.lastMessage?.platform_created_at || localMsg.platform_created_at,
                                        };
                                    }
                                }
                            });
                        }
                    }
                }
            } catch (localPreviewMergeError) {
                console.warn('[LiveMessages] Local conversation preview fallback merge failed:', localPreviewMergeError);
            }

            return NextResponse.json({
                conversations,
                account: {
                    id: decryptedAccount.id,
                    account_id: decryptedAccount.account_id,
                    account_name: decryptedAccount.account_name,
                    platform,
                },
                workspaceId: activeWorkspace.id,
                pageId,
                messagingCapabilities: messagingCapabilitiesFromAccount(platform, canManageMessages),
            });
        }

    } catch (error: any) {
        console.error('Live messages API error:', error);
        return NextResponse.json(
            {
                error: error.message || 'Failed to fetch messages',
                errorCode: 'internal_error',
                messagingCapabilities: messagingCapabilitiesFromError(null),
            },
            { status: 500 }
        );
    }
}
