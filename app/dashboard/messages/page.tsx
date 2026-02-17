"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { createClient } from "@/utils/supabase/client"
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
    AlertCircle,
    Lock,
    ArrowLeft,
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

// Check if error is a Meta permission error
function isPermissionError(error: Error | null): boolean {
    if (!error) return false
    const msg = error.message?.toLowerCase() || ''
    return msg.includes('requires permission') ||
        msg.includes('pages_messaging') ||
        msg.includes('#200') ||
        msg.includes('appropriate role')
}

export default function MessagesPage() {
    const [activePlatform, setActivePlatform] = useState<'instagram' | 'facebook'>('instagram')
    const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
    const [showThread, setShowThread] = useState(false) // mobile: toggle list vs thread
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
            refreshInterval: 30000, // 30s fallback — webhooks handle real-time
        }
    )

    // Subscribe to Supabase Realtime for webhook-triggered message updates
    // Uses the workspace ID from the conversations API response (active workspace)
    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
    const mutateConversationsRef = useRef(mutateConversations)
    const mutateMessagesRef = useRef(mutateMessages)
    mutateConversationsRef.current = mutateConversations
    mutateMessagesRef.current = mutateMessages

    const workspaceId = conversationsData?.workspaceId

    useEffect(() => {
        if (!workspaceId) return

        const supabase = createClient()

        // Subscribe to webhook broadcast channel for the active workspace
        const channel = supabase.channel(`messages:${workspaceId}`)
        channel.on('broadcast', { event: 'new_message' }, () => {
            console.log('[REALTIME] New message event — refreshing...')
            mutateConversationsRef.current()
            mutateMessagesRef.current()
        }).subscribe()

        channelRef.current = channel

        return () => {
            supabase.removeChannel(channel)
            channelRef.current = null
        }
    }, [workspaceId])

    const conversations = conversationsData?.conversations || []
    const noAccount = conversationsData?.error && !conversations.length
    const permissionDenied = isPermissionError(conversationsError)

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
        setShowThread(true) // On mobile, switch to thread view
    }

    const handleBackToList = () => {
        setShowThread(false)
    }

    // Reset selection when switching platforms
    const handlePlatformSwitch = (platform: 'instagram' | 'facebook') => {
        setActivePlatform(platform)
        setSelectedConversation(null)
        setShowThread(false)
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

            {/* Permission Error - Coming Soon */}
            {permissionDenied && !conversationsLoading && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="rounded-2xl border border-border/50 bg-muted/10 p-10 text-center max-w-md mx-auto">
                        <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
                            <Lock className="h-8 w-8 text-blue-500" />
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Facebook Messages</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Facebook messaging requires the <span className="font-medium text-foreground">pages_messaging</span> permission,
                            which is pending Meta app review approval.
                        </p>
                        <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Coming Soon
                        </div>
                    </div>
                </div>
            )}

            {/* Generic Error (non-permission) */}
            {conversationsError && !permissionDenied && !conversationsLoading && (
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

            {/* Main content - Split pane layout (responsive) */}
            {!conversationsLoading && !conversationsError && conversations.length > 0 && (
                <div className="flex flex-1 min-h-0 border rounded-lg overflow-hidden bg-background">
                    {/* Conversation list - Left pane */}
                    {/* On mobile: hidden when thread is open */}
                    <div className={cn(
                        "w-full md:w-80 border-r flex flex-col shrink-0 h-full",
                        showThread ? "hidden md:flex" : "flex"
                    )}>
                        <ConversationList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                        />
                    </div>

                    {/* Message thread - Right pane */}
                    {/* On mobile: hidden when list is showing; full width when thread is open */}
                    <div className={cn(
                        "flex-1 flex flex-col min-w-0 min-h-0 h-full",
                        showThread ? "flex" : "hidden md:flex"
                    )}>
                        {/* Mobile back button */}
                        {showThread && (
                            <div className="md:hidden shrink-0 px-3 pt-3">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleBackToList}
                                    className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
                                >
                                    <ArrowLeft className="h-4 w-4" />
                                    Back
                                </Button>
                            </div>
                        )}
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
