"use client"

import { useState } from "react"
import useSWR from "swr"
import { ConversationList } from "@/components/messages/conversation-list"
import { MessageThread } from "@/components/messages/message-thread"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import {
    Instagram,
    Facebook,
    Loader2,
    RefreshCw,
    Inbox,
    AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface Message {
    id: string
    platform_message_id: string
    sender_id: string
    sender_name?: string
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
    account: {
        id: string
        account_id: string
        account_name: string
        platform: string
    } | null
    workspaceId: string
    pageId: string
    error?: string
}

interface MessagesResponse {
    messages: Message[]
    pageId: string
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok && res.status !== 200) throw new Error(data.error || 'Failed to fetch')
    return data
}

export default function MessagesPage() {
    const [activePlatform, setActivePlatform] = useState<'instagram' | 'facebook'>('instagram')
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
    const { toast } = useToast()

    // Fetch conversations live from Meta API
    const {
        data: conversationsData,
        error: conversationsError,
        isLoading: conversationsLoading,
        mutate: mutateConversations
    } = useSWR<ConversationsResponse>(
        `/api/live-messages?platform=${activePlatform}`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    // Fetch messages for selected conversation
    const {
        data: messagesData,
        error: messagesError,
        isLoading: messagesLoading,
        mutate: mutateMessages
    } = useSWR<MessagesResponse>(
        selectedConversation
            ? `/api/live-messages?conversationId=${selectedConversation.platform_conversation_id}&platform=${activePlatform}`
            : null,
        fetcher,
        {
            revalidateOnFocus: false,
            refreshInterval: 10000, // Poll every 10s for new messages
        }
    )

    const conversations = conversationsData?.conversations || []
    const noAccount = conversationsData?.error && !conversations.length

    const handleSendMessage = async (message: string) => {
        if (!selectedConversation) return

        try {
            const response = await fetch('/api/live-messages/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipientId: selectedConversation.participant_id,
                    message,
                    platform: activePlatform,
                }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to send message')
            }

            toast({
                title: "Message sent",
                description: "Your message has been sent.",
            })

            // Refresh messages
            mutateMessages()
            mutateConversations()
        } catch (error: any) {
            console.error('Send message error:', error)
            toast({
                title: "Send failed",
                description: error.message || "Failed to send message.",
                variant: "destructive",
            })
            throw error
        }
    }

    const handleSelectConversation = (conversation: Conversation) => {
        setSelectedConversation(conversation)
    }

    // Reset selection when switching platforms
    const handlePlatformSwitch = (platform: 'instagram' | 'facebook') => {
        setActivePlatform(platform)
        setSelectedConversation(null)
    }

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            color: 'from-pink-500 to-purple-600',
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            color: 'from-blue-500 to-blue-700',
        },
    ]

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 space-y-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            View and reply to your DMs
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            mutateConversations()
                            if (selectedConversation) mutateMessages()
                        }}
                        disabled={conversationsLoading}
                        className="gap-2 self-start"
                    >
                        <RefreshCw className={cn("h-4 w-4", conversationsLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>

                {/* Platform Tabs */}
                <div className="flex gap-2">
                    {tabs.map((tab) => {
                        const isActive = activePlatform === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handlePlatformSwitch(tab.id)}
                                className={cn(
                                    "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                    isActive
                                        ? `bg-linear-to-r ${tab.color} text-white shadow-lg`
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                                )}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* Account info */}
                {conversationsData?.account && (
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <div className={cn(
                            "w-2 h-2 rounded-full",
                            activePlatform === 'instagram' ? "bg-pink-500" : "bg-blue-500"
                        )} />
                        Connected as <span className="font-medium text-foreground">{conversationsData.account.account_name}</span>
                    </div>
                )}
            </div>

            {/* Loading */}
            {conversationsLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Loading conversations...</p>
                    </div>
                </div>
            )}

            {/* Error */}
            {conversationsError && !conversationsLoading && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                    <p className="text-sm font-medium text-destructive">Failed to load conversations</p>
                    <p className="text-xs text-muted-foreground mt-1">{conversationsError.message}</p>
                </div>
            )}

            {/* No account connected */}
            {noAccount && !conversationsLoading && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-12 text-center">
                    <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Connect your account in Settings to view messages.
                    </p>
                </div>
            )}

            {/* Main content - Split pane layout */}
            {!conversationsLoading && !conversationsError && conversations.length > 0 && (
                <div className="flex flex-1 min-h-0 border rounded-lg overflow-hidden bg-background">
                    {/* Conversation list - Left pane */}
                    <div className="w-80 border-r flex flex-col shrink-0 h-full">
                        <ConversationList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                        />
                    </div>

                    {/* Message thread - Right pane */}
                    <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full">
                        <MessageThread
                            conversation={selectedConversation}
                            messages={messagesData?.messages || []}
                            isLoading={messagesLoading}
                            onSendMessage={handleSendMessage}
                            workspaceId={conversationsData?.workspaceId || null}
                            platform={activePlatform}
                        />
                    </div>
                </div>
            )}

            {/* Empty state (account connected but no conversations) */}
            {!conversationsLoading && !conversationsError && !noAccount && conversations.length === 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-12 text-center">
                    <Inbox className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No conversations yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        {activePlatform === 'instagram'
                            ? 'Instagram DMs will appear here once you receive messages.'
                            : 'Facebook messages will appear here once you receive messages.'}
                    </p>
                </div>
            )}
        </div>
    )
}
