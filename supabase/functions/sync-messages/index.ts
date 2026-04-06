// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { canManageMessagesWithMetaAccount, decryptMetaAccountRow } from "../_shared/meta-account.ts"
import { META_GRAPH_API_BASE_URL } from "../_shared/meta-graph.ts";

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
    id: string;
    message?: string;
    from?: {
        id: string;
        username?: string;
        name?: string;
    };
    created_time?: string;
    attachments?: {
        data: Array<{
            id: string;
            mime_type?: string;
            file_url?: string;
            image_data?: {
                url: string;
            };
        }>;
    };
}

interface Conversation {
    id: string;
    participants?: {
        data: Array<{
            id: string;
            username?: string;
            name?: string;
            profile_pic?: string;
        }>;
    };
    messages?: {
        data: Message[];
    };
    updated_time?: string;
}

/**
 * Sync messages/DMs from Instagram for all social accounts in a workspace
 */
async function syncMessages(supabase: any, workspaceId: string) {
    console.log(`[MessageSync] Starting messages sync for workspace: ${workspaceId}`);

    // Get social accounts (Instagram only for DMs)
    const { data: accounts, error: accountsError } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('platform', 'instagram');

    if (accountsError) {
        console.error(`[MessageSync] Error fetching accounts:`, accountsError);
        return { conversations: 0, messages: 0, error: accountsError.message };
    }

    if (!accounts || accounts.length === 0) {
        console.log(`[MessageSync] No Instagram accounts found`);
        return { conversations: 0, messages: 0, message: 'No Instagram accounts found' };
    }
    const decryptedAccounts = await Promise.all(accounts.map((account: any) => decryptMetaAccountRow(account)));

    let conversationCount = 0;
    let messageCount = 0;

    for (const account of decryptedAccounts) {
        if (!account.access_token) {
            console.log(`[MessageSync] Account ${account.id} has no access token, skipping`);
            continue;
        }

        if (!canManageMessagesWithMetaAccount(
            account.metadata,
            account.platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            console.log(`[MessageSync] Account ${account.id} lacks messaging capability, skipping`);
            continue;
        }

        try {
            // Get conversations for this Instagram account
            // Note: Requires instagram_manage_messages + pages_messaging permissions
            // The conversations endpoint must use the Page ID, not the IG user ID
            const igUserId = account.account_id;
            const pageId = account.metadata?.connected_page_id;

            if (!pageId) {
                console.log(`[MessageSync] Account ${account.id} has no connected_page_id in metadata, skipping`);
                continue;
            }

            const conversationsUrl = `${META_GRAPH_URL}/${pageId}/conversations?fields=id,participants,messages{id,message,from,created_time,attachments},updated_time&platform=instagram&access_token=${account.access_token}`;

            console.log(`[MessageSync] Fetching conversations for page ${pageId} (IG: ${igUserId})`);

            const response = await fetch(conversationsUrl);
            const data = await response.json();

            if (!response.ok) {
                if (data.error?.code === 10 || data.error?.code === 100) {
                    console.log(`[MessageSync] Instagram messaging not enabled or no permission for account ${account.id}`);
                    continue;
                }
                console.error(`[MessageSync] Instagram API error:`, data.error);
                continue;
            }

            const conversations: Conversation[] = data.data || [];
            console.log(`[MessageSync] Found ${conversations.length} conversations`);

            for (const conv of conversations) {
                // Find the other participant (not the page/account)
                const participant = conv.participants?.data?.find(p => p.id !== pageId && p.id !== igUserId);

                if (!participant) {
                    console.log(`[MessageSync] No participant found for conversation ${conv.id}`);
                    continue;
                }

                // Count unread messages (we'll track this based on is_read flag later)
                const unreadCount = conv.messages?.data?.filter(m => m.from?.id !== pageId && m.from?.id !== igUserId).length || 0;

                // Upsert conversation
                const conversationRecord = {
                    workspace_id: workspaceId,
                    social_account_id: account.id,
                    platform_conversation_id: conv.id,
                    participant_id: participant.id,
                    participant_username: participant.username || participant.name || null,
                    participant_profile_picture: participant.profile_pic || null,
                    last_message_at: conv.updated_time || new Date().toISOString(),
                    unread_count: unreadCount
                };

                const { data: upsertedConv, error: convError } = await supabase
                    .from('conversations')
                    .upsert(conversationRecord, {
                        onConflict: 'workspace_id,platform_conversation_id'
                    })
                    .select()
                    .single();

                if (convError) {
                    console.error(`[MessageSync] Failed to upsert conversation ${conv.id}:`, convError);
                    continue;
                }

                conversationCount++;

                // Sync messages for this conversation
                const messages = conv.messages?.data || [];

                for (const msg of messages) {
                    const isFromPage = msg.from?.id === pageId || msg.from?.id === igUserId;

                    // Process attachments
                    const attachments = msg.attachments?.data?.map(att => ({
                        id: att.id,
                        type: att.mime_type || 'unknown',
                        url: att.file_url || att.image_data?.url || null
                    })) || [];

                    const messageRecord = {
                        workspace_id: workspaceId,
                        conversation_id: upsertedConv.id,
                        platform_message_id: msg.id,
                        sender_id: msg.from?.id || '',
                        is_from_page: isFromPage,
                        message: msg.message || null,
                        attachments: JSON.stringify(attachments),
                        is_read: isFromPage, // Messages we sent are considered "read"
                        platform_created_at: msg.created_time || new Date().toISOString()
                    };

                    const { error: msgError } = await supabase
                        .from('messages')
                        .upsert(messageRecord, {
                            onConflict: 'workspace_id,platform_message_id'
                        });

                    if (msgError) {
                        console.error(`[MessageSync] Failed to upsert message ${msg.id}:`, msgError);
                    } else {
                        messageCount++;
                    }
                }
            }
        } catch (error) {
            console.error(`[MessageSync] Error syncing messages for account ${account.id}:`, error);
        }
    }

    console.log(`[MessageSync] Sync complete. Conversations: ${conversationCount}, Messages: ${messageCount}`);
    return { conversations: conversationCount, messages: messageCount };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { workspaceId } = await req.json();

        if (!workspaceId) {
            return new Response(
                JSON.stringify({ error: 'workspaceId is required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        const results = await syncMessages(supabase, workspaceId);

        return new Response(
            JSON.stringify(results),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('Sync messages error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
