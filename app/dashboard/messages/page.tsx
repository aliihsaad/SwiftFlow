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
    errorCode?: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
    messagingCapabilities?: {
        canReadMessages: boolean
        canSendMessages: boolean
        reason: string | null
        missingPermissions: string[]
    }
}

interface MessagesResponse {
    messages: Message[]
    pageId: string
    error?: string
    errorCode?: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
    messagingCapabilities?: {
        canReadMessages: boolean
        canSendMessages: boolean
        reason: string | null
        missingPermissions: string[]
    }
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok && res.status !== 200) throw new Error(data.error || 'Failed to fetch')
    return data
}

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
    const [showThread, setShowThread] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const { toast } = useToast()

    const {
        data: conversationsData,
        error: conversationsError,
        isLoading: conversationsLoading,
        isValidating: conversationsValidating,
        mutate: mutateConversations
    } = useSWR<ConversationsResponse>(
        `/api/live-messages?platform=${activePlatform}`,
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )

    const {
        data: messagesData,
        isLoading: messagesLoading,
        isValidating: messagesValidating,
        mutate: mutateMessages
    } = useSWR<MessagesResponse>(
        selectedConversation
            ? `/api/live-messages?conversationId=${selectedConversation.platform_conversation_id}&platform=${activePlatform}`
            : null,
        fetcher,
        { revalidateOnFocus: false, refreshInterval: 30000 }
    )

    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
    const mutateConversationsRef = useRef(mutateConversations)
    const mutateMessagesRef = useRef(mutateMessages)
    mutateConversationsRef.current = mutateConversations
    mutateMessagesRef.current = mutateMessages

    const workspaceId = conversationsData?.workspaceId

    useEffect(() => {
        if (!workspaceId) return
        const supabase = createClient()
        const channel = supabase.channel(`messages:${workspaceId}`)
        channel.on('broadcast', { event: 'new_message' }, () => {
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
    const showInitialConversationsLoading = conversationsLoading && !conversationsData && !conversationsError
    const showConversationsRefreshingHint = (isRefreshing || conversationsValidating) && !!conversationsData
    const showThreadRefreshingHint = messagesValidating && !!messagesData?.messages?.length
    const responsePermissionDenied = conversationsData?.errorCode === 'meta_missing_permission'
    const responseTokenInvalid = conversationsData?.errorCode === 'meta_auth_invalid_token'
    const noAccount = conversationsData?.errorCode === 'no_account_connected'
    const permissionDenied = responsePermissionDenied || isPermissionError(conversationsError)
    const messagingCapabilities = conversationsData?.messagingCapabilities
    const sendDisabled = messagingCapabilities?.canSendMessages === false
    const sendDisabledReason = responseTokenInvalid
        ? 'Meta token expired or invalid. Reconnect your account in Settings.'
        : permissionDenied
            ? (conversationsData?.error || 'Messaging permissions are not enabled for this account.')
            : null

    const handleSendMessage = async (message: string) => {
        if (!selectedConversation) return
        if (sendDisabled) {
            const missingPerms = conversationsData?.missingPermissions?.length
                ? ` Missing permissions: ${conversationsData.missingPermissions.join(', ')}.`
                : ''
            const fallback = sendDisabledReason || 'Messaging is not available for this account.'
            toast({
                title: "Messaging unavailable",
                description: `${fallback}${missingPerms}`,
                variant: "destructive",
            })
            throw new Error(fallback)
        }
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
                const extra = Array.isArray(err?.missingPermissions) && err.missingPermissions.length
                    ? ` Missing permissions: ${err.missingPermissions.join(', ')}.`
                    : ''
                throw new Error((err.error || 'Failed to send message') + extra)
            }
            toast({ title: "Message sent", description: "Your message has been sent." })
            mutateMessages()
            mutateConversations()
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Failed to send message.'
            console.error('Send message error:', error)
            toast({ title: "Send failed", description: msg, variant: "destructive" })
            throw error
        }
    }

    const handleSelectConversation = (conversation: Conversation) => {
        setSelectedConversation(conversation)
        setShowThread(true)
    }

    const handlePlatformSwitch = (platform: 'instagram' | 'facebook') => {
        setActivePlatform(platform)
        setSelectedConversation(null)
        setShowThread(false)
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await Promise.all([
                mutateConversations(),
                selectedConversation ? mutateMessages() : Promise.resolve(null),
            ])
        } finally {
            setIsRefreshing(false)
        }
    }

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            activeStyle: { background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', boxShadow: '0 4px 16px rgba(236,72,153,0.25)' },
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            activeStyle: { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' },
        },
    ]

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 space-y-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                            Messages
                        </h1>
                        <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                            View and reply to your DMs
                        </p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={conversationsLoading || isRefreshing}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold self-start transition-all duration-150 disabled:opacity-50"
                        style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", (conversationsLoading || isRefreshing) && "animate-spin")} />
                        {isRefreshing ? 'Refreshing…' : 'Refresh'}
                    </button>
                </div>

                {/* Platform Tabs */}
                <div className="flex gap-2">
                    {tabs.map((tab) => {
                        const isActive = activePlatform === tab.id
                        return (
                            <button
                                key={tab.id}
                                onClick={() => handlePlatformSwitch(tab.id)}
                                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                                style={isActive ? tab.activeStyle : {
                                    background: '#12111e',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.4)',
                                }}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>

                {/* Account info */}
                {conversationsData?.account && (
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: activePlatform === 'instagram' ? '#ec4899' : '#3b82f6' }} />
                        Connected as{' '}
                        <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {conversationsData.account.account_name}
                        </span>
                    </div>
                )}
            </div>

            {showConversationsRefreshingHint && (
                <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium w-fit"
                    style={{ background: '#0e0d1c', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}
                >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Updating conversations…
                </div>
            )}

            {/* Initial Loading Skeleton */}
            {showInitialConversationsLoading && (
                <div
                    className="flex flex-1 min-h-0 overflow-hidden rounded-xl"
                    style={{ background: '#0e0d1c', border: '1px solid rgba(139,92,246,0.12)' }}
                >
                    <div
                        className="w-full md:w-80 shrink-0 p-3 space-y-2"
                        style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div
                                key={`conversation-skeleton-${index}`}
                                className="rounded-xl p-3 animate-pulse"
                                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="h-9 w-9 rounded-full" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-3 rounded w-2/3" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                        <div className="h-2.5 rounded w-4/5" style={{ background: 'rgba(255,255,255,0.04)' }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="hidden md:flex flex-1 flex-col p-4">
                        <div className="rounded-xl p-4 mb-4 animate-pulse" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="h-4 w-48 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                        </div>
                        <div className="flex-1 space-y-3">
                            {Array.from({ length: 5 }).map((_, index) => (
                                <div key={`thread-skeleton-${index}`} className={cn("flex", index % 2 ? "justify-end" : "justify-start")}>
                                    <div
                                        className="h-14 rounded-2xl animate-pulse"
                                        style={{
                                            width: index % 2 ? '40%' : '52%',
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 h-12 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
                    </div>
                </div>
            )}

            {/* Permission Error */}
            {permissionDenied && !showInitialConversationsLoading && (
                <div className="flex-1 flex items-center justify-center">
                    <div
                        className="rounded-2xl p-10 text-center max-w-md mx-auto"
                        style={{ background: '#0e0d1c', border: '1px solid rgba(59,130,246,0.15)' }}
                    >
                        <div
                            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                            style={{ background: 'rgba(59,130,246,0.1)' }}
                        >
                            <Lock className="h-8 w-8" style={{ color: '#60a5fa' }} />
                        </div>
                        <h3 className="text-base font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            {activePlatform === 'instagram' ? 'Instagram Messages' : 'Facebook Messages'}
                        </h3>
                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
                            {conversationsData?.error || 'Messaging permissions are not enabled for this account.'}
                        </p>
                        {!!conversationsData?.missingPermissions?.length && (
                            <div className="mt-4 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                Missing permissions:{" "}
                                <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.72)' }}>
                                    {conversationsData.missingPermissions.join(', ')}
                                </span>
                            </div>
                        )}
                        <div
                            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold"
                            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}
                        >
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Coming Soon
                        </div>
                    </div>
                </div>
            )}

            {/* Generic Error */}
            {conversationsError && !permissionDenied && !showInitialConversationsLoading && (
                <div
                    className="rounded-xl p-8 text-center"
                    style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                >
                    <AlertCircle className="h-7 w-7 mx-auto mb-3" style={{ color: '#f87171' }} />
                    <p className="text-sm font-medium" style={{ color: '#f87171' }}>Failed to load conversations</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{conversationsError.message}</p>
                </div>
            )}

            {/* No account */}
            {noAccount && !showInitialConversationsLoading && (
                <div className="rounded-xl p-12 text-center" style={{ background: '#0e0d1c', border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <Inbox className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        Connect your account in Settings to view messages.
                    </p>
                </div>
            )}

            {/* Main split pane */}
            {!showInitialConversationsLoading && !conversationsError && conversations.length > 0 && (
                <div
                    className={cn("flex flex-1 min-h-0 overflow-hidden rounded-xl transition-opacity", showConversationsRefreshingHint && "opacity-95")}
                    style={{ background: '#0e0d1c', border: '1px solid rgba(139,92,246,0.12)' }}
                >
                    {/* Left — conversation list */}
                    <div
                        className={cn(
                            "w-full md:w-80 flex flex-col shrink-0 h-full",
                            showThread ? "hidden md:flex" : "flex"
                        )}
                        style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}
                    >
                        <ConversationList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                        />
                    </div>

                    {/* Right — message thread */}
                    <div className={cn(
                        "flex-1 flex flex-col min-w-0 min-h-0 h-full",
                        showThread ? "flex" : "hidden md:flex"
                    )}>
                        {/* Mobile back */}
                        {showThread && (
                            <div className="md:hidden shrink-0 px-3 pt-3">
                                <button
                                    onClick={() => setShowThread(false)}
                                    className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all duration-150"
                                    style={{ color: 'rgba(255,255,255,0.4)' }}
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    Back
                                </button>
                            </div>
                        )}
                        {showThreadRefreshingHint && (
                            <div className="shrink-0 px-4 pt-2">
                                <div
                                    className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-[11px] font-medium"
                                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)' }}
                                >
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Updating messages…
                                </div>
                            </div>
                        )}
                        <MessageThread
                            conversation={selectedConversation}
                            messages={messagesData?.messages || []}
                            isLoading={messagesLoading}
                            onSendMessage={handleSendMessage}
                            workspaceId={conversationsData?.workspaceId || null}
                            platform={activePlatform}
                            composerDisabled={sendDisabled}
                            composerDisabledReason={sendDisabledReason}
                        />
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!showInitialConversationsLoading && !conversationsError && !noAccount && conversations.length === 0 && (
                <div className="rounded-xl p-12 text-center" style={{ background: '#0e0d1c', border: '1px dashed rgba(255,255,255,0.08)' }}>
                    <Inbox className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>No conversations yet</p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        {activePlatform === 'instagram'
                            ? 'Instagram DMs will appear here once you receive messages.'
                            : 'Facebook messages will appear here once you receive messages.'}
                    </p>
                </div>
            )}
        </div>
    )
}
