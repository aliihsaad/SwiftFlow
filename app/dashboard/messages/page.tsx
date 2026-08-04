"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Inbox,
    Instagram,
    Lock,
    MessageCircleMore,
    RefreshCw,
} from "lucide-react"

import { ConversationList } from "@/components/messages/conversation-list"
import { MessageThread } from "@/components/messages/message-thread"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useToast } from "@/components/ui/use-toast"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"

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

interface MessagingCapabilities {
    canReadMessages: boolean
    canSendMessages: boolean
    reason: string | null
    missingPermissions: string[]
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
    messagingCapabilities?: MessagingCapabilities
}

interface MessagesResponse {
    messages: Message[]
    pageId: string
    error?: string
    errorCode?: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
    messagingCapabilities?: MessagingCapabilities
}

const fetcher = async (url: string) => {
    const response = await fetch(url)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Failed to fetch messages")
    return data
}

function isPermissionError(error: Error | null): boolean {
    if (!error) return false
    const message = error.message?.toLowerCase() || ""
    return message.includes("requires permission") ||
        message.includes("#200") ||
        message.includes("appropriate role")
}

export default function MessagesPage() {
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
        mutate: mutateConversations,
    } = useSWR<ConversationsResponse>(
        "/api/live-messages?platform=instagram",
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30_000 },
    )

    const {
        data: messagesData,
        isLoading: messagesLoading,
        isValidating: messagesValidating,
        mutate: mutateMessages,
    } = useSWR<MessagesResponse>(
        selectedConversation
            ? `/api/live-messages?conversationId=${selectedConversation.platform_conversation_id}&platform=instagram`
            : null,
        fetcher,
        { revalidateOnFocus: false, refreshInterval: 30_000 },
    )

    const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null)
    const workspaceId = conversationsData?.workspaceId

    useEffect(() => {
        if (!workspaceId) return
        const supabase = createClient()
        const channel = supabase.channel(`messages:${workspaceId}`)
        channel.on("broadcast", { event: "new_message" }, () => {
            void mutateConversations()
            void mutateMessages()
        }).subscribe()
        channelRef.current = channel

        return () => {
            void supabase.removeChannel(channel)
            channelRef.current = null
        }
    }, [workspaceId, mutateConversations, mutateMessages])

    const conversations = useMemo(
        () => conversationsData?.conversations || [],
        [conversationsData?.conversations],
    )
    const unreadCount = useMemo(
        () => conversations.reduce((total, conversation) => total + Math.max(0, conversation.unread_count || 0), 0),
        [conversations],
    )
    const showInitialLoading = conversationsLoading && !conversationsData && !conversationsError
    const showRefreshingHint = (isRefreshing || conversationsValidating) && Boolean(conversationsData)
    const showThreadRefreshingHint = messagesValidating && Boolean(messagesData?.messages?.length)
    const responsePermissionDenied = conversationsData?.errorCode === "meta_missing_permission"
    const responseTokenInvalid = conversationsData?.errorCode === "meta_auth_invalid_token"
    const noAccount = conversationsData?.errorCode === "no_account_connected"
    const permissionDenied = responsePermissionDenied || isPermissionError(conversationsError)
    const messagingCapabilities = messagesData?.messagingCapabilities || conversationsData?.messagingCapabilities
    const sendDisabledByRole = !canWriteContent
    const sendDisabled = sendDisabledByRole || messagingCapabilities?.canSendMessages === false
    const sendDisabledReason = sendDisabledByRole
        ? "Your workspace role is read-only. Viewers cannot send or reply to messages."
        : responseTokenInvalid
            ? "Meta token expired or invalid. Reconnect your account in Settings."
            : permissionDenied
                ? conversationsData?.error || "Messaging permissions are not enabled for this account."
                : messagingCapabilities?.reason || null

    const handleSendMessage = async (message: string) => {
        if (!selectedConversation) return
        if (sendDisabled) {
            const missingPermissions = conversationsData?.missingPermissions?.length
                ? ` Missing permissions: ${conversationsData.missingPermissions.join(", ")}.`
                : ""
            const fallback = sendDisabledReason || "Messaging is not available for this account."
            toast({
                title: "Messaging unavailable",
                description: `${fallback}${missingPermissions}`,
                variant: "destructive",
            })
            throw new Error(fallback)
        }

        try {
            const response = await fetch("/api/live-messages/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientId: selectedConversation.participant_id,
                    message,
                    platform: "instagram",
                }),
            })
            if (!response.ok) {
                const error = await response.json()
                const extra = Array.isArray(error?.missingPermissions) && error.missingPermissions.length
                    ? ` Missing permissions: ${error.missingPermissions.join(", ")}.`
                    : ""
                throw new Error((error.error || "Failed to send message") + extra)
            }
            toast({ title: "Message sent", description: "Your reply has been delivered." })
            await Promise.all([mutateMessages(), mutateConversations()])
        } catch (error: unknown) {
            const messageText = error instanceof Error ? error.message : "Failed to send message."
            console.error("Send message error:", error)
            toast({ title: "Send failed", description: messageText, variant: "destructive" })
            throw error
        }
    }

    const handleSelectConversation = (conversation: Conversation) => {
        setSelectedConversation(conversation)
        setShowThread(true)
    }


    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await Promise.all([
                mutateConversations(),
                selectedConversation ? mutateMessages() : Promise.resolve(null),
            ])
            toast({ title: "Inbox refreshed", description: "Conversation and thread data are up to date." })
        } catch (error: unknown) {
            toast({
                title: "Refresh failed",
                description: error instanceof Error ? error.message : "Could not refresh messages.",
                variant: "destructive",
            })
        } finally {
            setIsRefreshing(false)
        }
    }

    const accountConnected = Boolean(conversationsData?.account)
    const deliveryReady = accountConnected && !sendDisabled && !permissionDenied && !responseTokenInvalid

    return (
        <section className="flex h-full min-h-[560px] flex-col gap-3 overflow-hidden" aria-labelledby="inbox-heading">

            <header className="relative shrink-0 overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10131c] p-3 shadow-[0_16px_48px_rgba(2,4,12,0.24)] sm:px-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-200/15 bg-cyan-300/[0.07] text-cyan-100">
                            <MessageCircleMore className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 id="inbox-heading" className="text-lg font-semibold tracking-[-0.025em] text-white sm:text-xl">Inbox</h1>
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.11em]",
                                    deliveryReady
                                        ? "border-emerald-200/15 bg-emerald-300/[0.07] text-emerald-200"
                                        : accountConnected
                                            ? "border-amber-200/15 bg-amber-300/[0.07] text-amber-200"
                                            : "border-white/[0.08] bg-white/[0.035] text-white/35",
                                )}>
                                    <span className={cn("h-1.5 w-1.5 rounded-full", deliveryReady ? "bg-emerald-300" : accountConnected ? "bg-amber-300" : "bg-white/25")} />
                                    {deliveryReady ? "Live" : accountConnected ? "Limited" : "Offline"}
                                </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-white/36">
                                {accountConnected
                                    ? `${conversationsData?.account?.account_name} · ${conversations.length} conversations · ${unreadCount} unread`
                                    : "Connect Instagram to start messaging"}
                            </p>
                        </div>
                    </div>

                    <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-pink-200/15 bg-pink-300/[0.09] px-4 text-xs font-semibold text-pink-100" aria-label="Inbox platform">
                        <Instagram className="h-4 w-4" aria-hidden="true" />
                        Instagram
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="hidden items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-xs text-white/38 lg:flex">
                            <span className={cn("h-1.5 w-1.5 rounded-full", accountConnected ? "bg-emerald-300" : "bg-white/20")} />
                            <span className="max-w-48 truncate">
                                {accountConnected
                                    ? `Connected as ${conversationsData?.account?.account_name}`
                                    : "No Instagram inbox connected"}
                            </span>
                        </div>
                        {showRefreshingHint ? <InlineLoadingHint label="Updating…" className="px-2.5 py-1 text-[10px]" /> : null}
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={conversationsLoading || isRefreshing}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-200/15 bg-cyan-300/[0.07] px-3 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.11] disabled:cursor-not-allowed disabled:opacity-45"
                            title="Refresh inbox"
                        >
                            <RefreshCw className={cn("h-4 w-4", (isRefreshing || conversationsValidating) && "animate-spin")} aria-hidden="true" />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                        <Link
                            href="/dashboard/settings"
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 text-xs font-semibold text-white/58 transition hover:bg-white/[0.075] hover:text-white"
                        >
                            <span className="hidden sm:inline">Connections</span>
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </header>


            {showInitialLoading ? <InboxSkeleton /> : null}

            {permissionDenied && !showInitialLoading ? (
                <InboxNotice
                    icon={Lock}
                    title="Instagram message access is limited"
                    message={conversationsData?.error || "Messaging permissions are not enabled for this account."}
                    detail={conversationsData?.missingPermissions?.length
                        ? `Missing permissions: ${conversationsData.missingPermissions.join(", ")}`
                        : conversationsData?.requiresReconnect ? "Reconnect this account in Settings." : undefined}
                    tone="amber"
                />
            ) : null}

            {responseTokenInvalid && !showInitialLoading ? (
                <InboxNotice
                    icon={Lock}
                    title="Instagram needs to be reconnected"
                    message={conversationsData?.error || "The provider token is expired or invalid."}
                    detail="Reconnect this account in Settings before loading or sending messages."
                    tone="amber"
                />
            ) : null}

            {conversationsError && !permissionDenied && !showInitialLoading ? (
                <InboxNotice
                    icon={AlertCircle}
                    title="Inbox could not be loaded"
                    message={conversationsError.message}
                    tone="rose"
                />
            ) : null}

            {noAccount && !showInitialLoading ? (
                <InboxNotice
                    icon={Inbox}
                    title="Connect Instagram to activate this inbox"
                    message="The conversation desk only displays provider data for the active workspace."
                    detail="Open Settings, connect the account, and return here to load conversations."
                    tone="neutral"
                />
            ) : null}

            {!showInitialLoading && !conversationsError && !permissionDenied && !responseTokenInvalid && !noAccount && conversations.length > 0 ? (
                <div className={cn(
                    "flex min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0d1019] shadow-[0_20px_60px_rgba(0,0,0,0.24)] transition-opacity",
                    showRefreshingHint && "opacity-95",
                )}>
                    <div className={cn(
                        "h-full min-h-0 w-full shrink-0 flex-col border-white/[0.07] md:flex md:w-[320px] md:border-r lg:w-[340px] xl:w-[360px] 2xl:w-[380px]",
                        showThread ? "hidden md:flex" : "flex",
                    )}>
                        <ConversationList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                        />
                    </div>

                    <div className={cn(
                        "min-h-0 min-w-0 flex-1 flex-col",
                        showThread ? "flex" : "hidden md:flex",
                    )}>
                        {showThread ? (
                            <div className="shrink-0 border-b border-white/[0.06] px-3 py-2 md:hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowThread(false)}
                                    className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-white/48 transition hover:bg-white/[0.05] hover:text-white/76"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                    All conversations
                                </button>
                            </div>
                        ) : null}
                        {showThreadRefreshingHint ? (
                            <div className="shrink-0 px-4 pt-2">
                                <InlineLoadingHint label="Updating messages…" className="px-2.5 py-1 text-[11px]" />
                            </div>
                        ) : null}
                        <MessageThread
                            conversation={selectedConversation}
                            messages={messagesData?.messages || []}
                            isLoading={messagesLoading}
                            onSendMessage={handleSendMessage}
                            workspaceId={workspaceId || null}
                            composerDisabled={sendDisabled}
                            composerDisabledReason={sendDisabledReason}
                        />
                    </div>
                </div>
            ) : null}

            {!showInitialLoading && !conversationsError && !permissionDenied && !responseTokenInvalid && !noAccount && conversations.length === 0 ? (
                <InboxNotice
                    icon={Inbox}
                    title="Your conversation queue is clear"
                    message="Instagram messages will appear here as soon as the provider delivers them."
                    detail="Use Refresh inbox after testing a new provider conversation."
                    tone="neutral"
                />
            ) : null}
        </section>
    )
}

function InboxSkeleton() {
    return (
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0d1019]">
            <div className="w-full space-y-2 border-r border-white/[0.06] p-3 md:w-[340px]">
                {Array.from({ length: 7 }).map((_, index) => (
                    <div key={index} className="animate-pulse rounded-2xl border border-white/[0.04] bg-white/[0.025] p-3.5">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-white/[0.06]" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 w-2/3 rounded bg-white/[0.06]" />
                                <div className="h-2.5 w-4/5 rounded bg-white/[0.04]" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="hidden flex-1 animate-pulse p-6 md:block">
                <div className="h-14 rounded-2xl border border-white/[0.04] bg-white/[0.025]" />
                <div className="mt-10 space-y-4">
                    <div className="h-16 w-1/2 rounded-2xl bg-white/[0.035]" />
                    <div className="ml-auto h-16 w-2/5 rounded-2xl bg-cyan-300/[0.04]" />
                    <div className="h-20 w-3/5 rounded-2xl bg-white/[0.035]" />
                </div>
            </div>
        </div>
    )
}

function InboxNotice({
    icon: Icon,
    title,
    message,
    detail,
    tone,
}: {
    icon: typeof Inbox
    title: string
    message: string
    detail?: string
    tone: "amber" | "rose" | "neutral"
}) {
    const toneClass = tone === "amber"
        ? "border-amber-200/15 bg-amber-300/[0.045] text-amber-200"
        : tone === "rose"
            ? "border-rose-200/15 bg-rose-300/[0.045] text-rose-200"
            : "border-white/[0.08] bg-[#10131c] text-cyan-200"

    return (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-[22px] border border-dashed border-white/[0.08] bg-[#0f121b] px-5 py-10 text-center">
            <div className="max-w-lg">
                <span className={cn("mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border", toneClass)}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h2 className="mt-5 text-lg font-semibold tracking-[-0.02em] text-white/78">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-white/42">{message}</p>
                {detail ? <p className="mt-2 text-xs leading-5 text-white/28">{detail}</p> : null}
            </div>
        </div>
    )
}
