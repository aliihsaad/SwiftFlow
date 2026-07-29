"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { createClient } from "@/utils/supabase/client"
import { ConversationList } from "@/components/messages/conversation-list"
import { MessageThread } from "@/components/messages/message-thread"
import { useToast } from "@/components/ui/use-toast"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
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

const MSG_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.05)',
    text: 'rgba(255,255,255,0.9)',
    textStrong: 'rgba(255,255,255,0.82)',
    muted: 'rgba(255,255,255,0.5)',
    mutedSoft: 'rgba(255,255,255,0.35)',
    mutedFaint: 'rgba(255,255,255,0.25)',
    instagram: '#fb7185',
    instagramSoft: 'rgba(251,113,133,0.14)',
    facebook: '#38bdf8',
    facebookSoft: 'rgba(56,189,248,0.14)',
    amber: '#f59e0b',
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
    const canWriteContent = useWorkspacePermission("content:write")

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
    const workspaceId = conversationsData?.workspaceId

    useEffect(() => {
        if (!workspaceId) return
        const supabase = createClient()
        const channel = supabase.channel(`messages:${workspaceId}`)
        channel.on('broadcast', { event: 'new_message' }, () => {
            void mutateConversations()
            void mutateMessages()
        }).subscribe()
        channelRef.current = channel
        return () => {
            supabase.removeChannel(channel)
            channelRef.current = null
        }
    }, [workspaceId, mutateConversations, mutateMessages])

    const conversations = conversationsData?.conversations || []
    const showInitialConversationsLoading = conversationsLoading && !conversationsData && !conversationsError
    const showConversationsRefreshingHint = (isRefreshing || conversationsValidating) && !!conversationsData
    const showThreadRefreshingHint = messagesValidating && !!messagesData?.messages?.length
    const responsePermissionDenied = conversationsData?.errorCode === 'meta_missing_permission'
    const responseTokenInvalid = conversationsData?.errorCode === 'meta_auth_invalid_token'
    const noAccount = conversationsData?.errorCode === 'no_account_connected'
    const permissionDenied = responsePermissionDenied || isPermissionError(conversationsError)
    const messagingCapabilities = conversationsData?.messagingCapabilities
    const sendDisabledByRole = !canWriteContent
    const sendDisabled = sendDisabledByRole || messagingCapabilities?.canSendMessages === false
    const sendDisabledReason = sendDisabledByRole
        ? "Your workspace role is read-only. Viewers cannot send or reply to messages."
        : responseTokenInvalid
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
            toast({
                title: "Messages refreshed",
                description: "Conversation and thread data were updated.",
            })
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "Could not refresh messages."
            toast({
                title: "Refresh failed",
                description: errorMessage,
                variant: "destructive",
            })
        } finally {
            setIsRefreshing(false)
        }
    }

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            activeStyle: {
                background: MSG_THEME.instagramSoft,
                border: `1px solid rgba(251,113,133,0.25)`,
                color: '#ffe4ea',
                boxShadow: '0 8px 24px rgba(251,113,133,0.12)',
            },
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            activeStyle: {
                background: MSG_THEME.facebookSoft,
                border: `1px solid rgba(56,189,248,0.25)`,
                color: '#dff6ff',
                boxShadow: '0 8px 24px rgba(56,189,248,0.12)',
            },
        },
    ]

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 space-y-4 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <div
                            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold mb-2"
                            style={{
                                background: 'rgba(56,189,248,0.10)',
                                border: '1px solid rgba(56,189,248,0.2)',
                                color: '#dff6ff',
                            }}
                        >
                            <Inbox className="h-3.5 w-3.5" />
                            Messages
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight" style={{ color: MSG_THEME.text }}>
                            Messages
                        </h1>
                        <p className="text-sm mt-0.5" style={{ color: MSG_THEME.mutedSoft }}>
                            View and reply to your DMs
                        </p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={conversationsLoading || isRefreshing}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold self-start transition-all duration-150 disabled:opacity-50"
                        style={{ background: MSG_THEME.panelAlt, border: `1px solid ${MSG_THEME.border}`, color: MSG_THEME.muted }}
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
                                    background: MSG_THEME.panelAlt,
                                    border: `1px solid ${MSG_THEME.border}`,
                                    color: MSG_THEME.muted,
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
                    <div className="flex items-center gap-2 text-xs" style={{ color: MSG_THEME.mutedSoft }}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: activePlatform === 'instagram' ? MSG_THEME.instagram : MSG_THEME.facebook }} />
                        Connected as{' '}
                        <span className="font-semibold" style={{ color: MSG_THEME.textStrong }}>
                            {conversationsData.account.account_name}
                        </span>
                    </div>
                )}
            </div>

            {showConversationsRefreshingHint && (
                <InlineLoadingHint label="Updating conversations…" className="w-fit" />
            )}

            {/* Initial Loading Skeleton */}
            {showInitialConversationsLoading && (
                <div
                    className="flex flex-1 min-h-0 overflow-hidden rounded-xl"
                    style={{ background: MSG_THEME.panel, border: `1px solid ${MSG_THEME.border}` }}
                >
                    <div
                        className="w-full md:w-80 shrink-0 p-3 space-y-2"
                        style={{ borderRight: `1px solid ${MSG_THEME.borderSoft}` }}
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
                        style={{ background: MSG_THEME.panel, border: '1px solid rgba(245,158,11,0.18)' }}
                    >
                        <div
                            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                            style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.18)' }}
                        >
                            <Lock className="h-8 w-8" style={{ color: '#fbbf24' }} />
                        </div>
                        <h3 className="text-base font-semibold mb-2" style={{ color: MSG_THEME.textStrong }}>
                            {activePlatform === 'instagram' ? 'Instagram Messages' : 'Facebook Messages'}
                        </h3>
                        <p className="text-sm leading-relaxed" style={{ color: MSG_THEME.muted }}>
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
                            style={{ background: 'rgba(245,158,11,0.08)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.2)' }}
                        >
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Access Blocked
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
                <div className="rounded-xl p-12 text-center" style={{ background: MSG_THEME.panel, border: `1px dashed ${MSG_THEME.border}` }}>
                    <Inbox className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.16)' }} />
                    <p className="font-medium" style={{ color: MSG_THEME.muted }}>
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm mt-2" style={{ color: MSG_THEME.mutedFaint }}>
                        Connect your account in Settings to view messages.
                    </p>
                </div>
            )}

            {/* Main split pane */}
            {!showInitialConversationsLoading && !conversationsError && conversations.length > 0 && (
                <div
                    className={cn("flex flex-1 min-h-0 overflow-hidden rounded-xl transition-opacity", showConversationsRefreshingHint && "opacity-95")}
                    style={{ background: MSG_THEME.panel, border: `1px solid ${MSG_THEME.border}` }}
                >
                    {/* Left — conversation list */}
                    <div
                        className={cn(
                            "w-full md:w-80 flex flex-col shrink-0 h-full",
                            showThread ? "hidden md:flex" : "flex"
                        )}
                        style={{ borderRight: `1px solid ${MSG_THEME.borderSoft}` }}
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
                                <InlineLoadingHint label="Updating messages…" className="px-2.5 py-1 text-[11px]" />
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
                <div className="rounded-xl p-12 text-center" style={{ background: MSG_THEME.panel, border: `1px dashed ${MSG_THEME.border}` }}>
                    <Inbox className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.16)' }} />
                    <p className="font-medium" style={{ color: MSG_THEME.muted }}>No conversations yet</p>
                    <p className="text-sm mt-2" style={{ color: MSG_THEME.mutedFaint }}>
                        {activePlatform === 'instagram'
                            ? 'Instagram DMs will appear here once you receive messages.'
                            : 'Facebook messages will appear here once you receive messages.'}
                    </p>
                </div>
            )}
        </div>
    )
}
