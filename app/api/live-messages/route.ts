import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

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
                { error: `No ${platform} account connected`, conversations: [] },
                { status: 200 }
            );
        }

        if (!account.access_token) {
            return NextResponse.json(
                { error: 'No access token available' },
                { status: 400 }
            );
        }

        // For Instagram, we need the connected Page ID (messaging goes through Pages API)
        const pageId = platform === 'instagram'
            ? (account.metadata?.connected_page_id || account.account_id)
            : account.account_id;

        if (conversationId) {
            // ──────────────────────────────────────────────
            // MODE: Fetch messages for a specific conversation
            // ──────────────────────────────────────────────
            const messagesUrl = `${META_GRAPH_URL}/${conversationId}/messages?fields=id,message,from,created_time,attachments{mime_type,size,name}&limit=50&access_token=${account.access_token}`;

            console.log(`[LiveMessages] Fetching messages for conversation ${conversationId}`);
            const response = await fetch(messagesUrl);
            const data = await response.json();

            if (!response.ok) {
                console.error('[LiveMessages] Messages API error:', data.error);
                throw new Error(data.error?.message || 'Failed to fetch messages');
            }

            const messages = (data.data || []).map((msg: any) => ({
                id: msg.id,
                platform_message_id: msg.id,
                sender_id: msg.from?.id || '',
                sender_name: msg.from?.username || msg.from?.name || msg.from?.id || 'Unknown',
                is_from_page: msg.from?.id === pageId || msg.from?.id === account.account_id,
                message: msg.message || null,
                attachments: msg.attachments?.data ? JSON.stringify(msg.attachments.data) : '[]',
                platform_created_at: msg.created_time,
                is_read: true,
            }));

            // Reverse to show oldest first (Meta returns newest first)
            messages.reverse();

            return NextResponse.json({
                messages,
                pageId,
            });

        } else {
            // ──────────────────────────────────────────────
            // MODE: List all conversations
            // ──────────────────────────────────────────────
            let conversationsUrl = `${META_GRAPH_URL}/${pageId}/conversations?fields=id,participants,messages.limit(1){id,message,from,created_time},updated_time&limit=25&access_token=${account.access_token}`;

            // For Instagram, add platform filter
            if (platform === 'instagram') {
                conversationsUrl += '&platform=instagram';
            }

            console.log(`[LiveMessages] Fetching ${platform} conversations for page ${pageId}`);
            const response = await fetch(conversationsUrl);
            const data = await response.json();

            if (!response.ok) {
                console.error('[LiveMessages] Conversations API error:', data.error);
                // If messaging not enabled, return empty
                if (data.error?.code === 10 || data.error?.code === 100) {
                    return NextResponse.json({
                        conversations: [],
                        error: 'Messaging not enabled for this account',
                        account: { id: account.id, account_name: account.account_name, platform },
                        workspaceId: activeWorkspace.id,
                    });
                }
                throw new Error(data.error?.message || 'Failed to fetch conversations');
            }

            const conversations = (data.data || []).map((conv: any) => {
                // Find the other participant (not the page)
                const participant = conv.participants?.data?.find(
                    (p: any) => p.id !== pageId && p.id !== account.account_id
                );

                const lastMsg = conv.messages?.data?.[0];

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
                        account_name: account.account_name,
                    },
                    lastMessage: lastMsg ? {
                        id: lastMsg.id,
                        platform_message_id: lastMsg.id,
                        sender_id: lastMsg.from?.id || '',
                        is_from_page: lastMsg.from?.id === pageId || lastMsg.from?.id === account.account_id,
                        message: lastMsg.message || null,
                        attachments: '[]',
                        is_read: true,
                        platform_created_at: lastMsg.created_time,
                    } : undefined,
                };
            });

            return NextResponse.json({
                conversations,
                account: {
                    id: account.id,
                    account_id: account.account_id,
                    account_name: account.account_name,
                    platform,
                },
                workspaceId: activeWorkspace.id,
                pageId,
            });
        }

    } catch (error: any) {
        console.error('Live messages API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch messages' },
            { status: 500 }
        );
    }
}
