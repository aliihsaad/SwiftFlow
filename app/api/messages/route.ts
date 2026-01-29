import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// GET - List conversations or messages
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

            // Mark messages as read
            await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('conversation_id', conversationId)
                .eq('is_read', false);

            // Update conversation unread count
            await supabase
                .from('conversations')
                .update({ unread_count: 0 })
                .eq('id', conversationId);

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
                }
            });
        }

    } catch (error: any) {
        console.error('Get messages API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch messages' },
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

        // Get active workspace
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const body = await request.json();
        const { conversationId, message } = body;

        if (!conversationId || !message) {
            return NextResponse.json(
                { error: 'conversationId and message are required' },
                { status: 400 }
            );
        }

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

        const account = conversation.social_accounts;
        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        // Send message via Meta API
        // Instagram messaging requires the Page ID, not the IG user ID
        const pageId = account.metadata?.connected_page_id || account.account_id;
        const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;

        const response = await fetch(sendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                recipient: {
                    id: conversation.participant_id
                },
                message: {
                    text: message
                },
                access_token: account.access_token
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to send message');
        }

        // Store the sent message locally
        const messageRecord = {
            workspace_id: activeWorkspace.id,
            conversation_id: conversation.id,
            platform_message_id: result.message_id || `local_${Date.now()}`,
            sender_id: igUserId,
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
            .eq('id', conversationId);

        return NextResponse.json({
            success: true,
            messageId: result.message_id,
            message: savedMessage
        });

    } catch (error: any) {
        console.error('Send message API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to send message' },
            { status: 500 }
        );
    }
}
