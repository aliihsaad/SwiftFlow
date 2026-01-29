"use client"

import { useState } from "react"
import useSWR from "swr"
import { MessagesHeader } from "@/components/messages/messages-header"
import { ConversationList } from "@/components/messages/conversation-list"
import { MessageThread } from "@/components/messages/message-thread"
import { MessagesLoadingSkeleton } from "@/components/messages/messages-loading"
import { useToast } from "@/components/ui/use-toast"

interface Message {
    id: string
    platform_message_id: string
    sender_id: string
    is_from_page: boolean
    message: string | null
    attachments: string
    is_read: boolean
    platform_created_at: string
}

interface Conversation {
    id: string
    platform_conversation_id: string
    participant_id: string
    participant_username: string | null
    participant_profile_picture: string | null
    last_message_at: string
    unread_count: number
    social_accounts: {
        platform: string
        account_name: string
    } | null
    lastMessage?: Message
}

interface ConversationsResponse {
    conversations: Conversation[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
    workspaceId: string
}

interface MessagesResponse {
    messages: Message[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch')
    return data
}

export default function MessagesPage() {
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
    const [isSyncing, setIsSyncing] = useState(false)
    const { toast } = useToast()

    // Fetch conversations
    const { data: conversationsData, error: conversationsError, isLoading: conversationsLoading, mutate: mutateConversations } = useSWR<ConversationsResponse>(
        '/api/messages',
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    // Fetch messages for selected conversation
    const { data: messagesData, error: messagesError, isLoading: messagesLoading, mutate: mutateMessages } = useSWR<MessagesResponse>(
        selectedConversation ? `/api/messages?conversationId=${selectedConversation.id}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            refreshInterval: 10000, // Poll for new messages every 10 seconds
        }
    )

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const response = await fetch('/api/sync-messages', {
                method: 'POST'
            })

            if (!response.ok) {
                throw new Error('Failed to sync messages')
            }

            const result = await response.json()

            toast({
                title: "Messages synced",
                description: `Synced ${result.conversations || 0} conversations and ${result.messages || 0} messages`,
            })

            // Refresh conversations
            mutateConversations()
            if (selectedConversation) {
                mutateMessages()
            }
        } catch (error) {
            console.error('Sync error:', error)
            toast({
                title: "Sync failed",
                description: "Failed to sync messages. Please try again.",
                variant: "destructive",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const handleSendMessage = async (message: string) => {
        if (!selectedConversation) return

        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: selectedConversation.id,
                    message
                })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to send message')
            }

            // Refresh messages
            mutateMessages()
            mutateConversations()
        } catch (error: any) {
            console.error('Send message error:', error)
            toast({
                title: "Send failed",
                description: error.message || "Failed to send message. Please try again.",
                variant: "destructive",
            })
            throw error
        }
    }

    const handleSelectConversation = (conversation: Conversation) => {
        setSelectedConversation(conversation)
    }

    const totalUnread = conversationsData?.conversations?.reduce((sum, conv) => sum + (conv.unread_count || 0), 0) || 0

    return (
        <div className="h-[calc(100vh-8rem)]">
            {/* Page header */}
            <MessagesHeader
                onSync={handleSync}
                isSyncing={isSyncing}
                totalConversations={conversationsData?.pagination?.total || 0}
                unreadCount={totalUnread}
            />

            {/* Loading state */}
            {conversationsLoading && <MessagesLoadingSkeleton />}

            {/* Error state */}
            {conversationsError && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center mt-6">
                    <p className="text-destructive font-medium">Failed to load messages</p>
                    <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
                </div>
            )}

            {/* Main content - Split pane layout */}
            {conversationsData?.conversations && !conversationsLoading && (
                <div className="flex h-[calc(100%-5rem)] mt-6 border rounded-lg overflow-hidden bg-background">
                    {/* Conversation list - Left pane */}
                    <div className="w-80 border-r flex-shrink-0 overflow-hidden">
                        <ConversationList
                            conversations={conversationsData.conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                        />
                    </div>

                    {/* Message thread - Right pane */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <MessageThread
                            conversation={selectedConversation}
                            messages={messagesData?.messages || []}
                            isLoading={messagesLoading}
                            onSendMessage={handleSendMessage}
                            workspaceId={conversationsData?.workspaceId || null}
                        />
                    </div>
                </div>
            )}

            {/* Empty state */}
            {conversationsData?.conversations && conversationsData.conversations.length === 0 && !conversationsLoading && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-12 text-center mt-6">
                    <p className="text-muted-foreground font-medium">No conversations yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Sync your Instagram account to start seeing DMs.
                    </p>
                </div>
            )}
        </div>
    )
}
