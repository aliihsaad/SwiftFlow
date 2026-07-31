"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Facebook,
    Inbox,
    Instagram,
    Lock,
    MessageCircleMore,
    RefreshCw,
    ShieldCheck,
    Users,
} from "lucide-react"

import { ConversationList } from "@/components/messages/conversation-list"
import { MessageThread } from "@/components/messages/message-thread"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useToast } from "@/components/ui/use-toast"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { cn } from "@/lib/utils"
import { createClient } from "@/utils/supabase/client"

type Platform = "instagram" | "facebook"

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
        message.includes("pages_messaging") ||
        message.includes("#200") ||
        message.includes("appropriate role")
}

export default function MessagesPage() {
    const [activePlatform, setActivePlatform] = useState<Platform>("instagram")
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
        `/api/live-messages?platform=${activePlatform}`,
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
            ? `/api/live-messages?conversationId=${selectedConversation.platform_conversation_id}&platform=${activePlatform}`
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
                    platform: activePlatform,
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

    const handlePlatformSwitch = (platform: Platform) => {
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
        <section className="flex min-h-[calc(100dvh-8.5rem)] flex-col gap-5" aria-labelledby="inbox-heading">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#10131e] shadow-[0_28px_90px_rgba(2,4,12,0.34)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(244,114,182,0.17),transparent_35%),radial-gradient(circle_at_92%_8%,rgba(34,211,238,0.14),transparent_34%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-pink-200/45 to-transparent" />

                <div className="relative grid gap-7 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)] xl:p-8">
                    <div className="flex min-w-0 flex-col justify-between gap-7">
                        <div>
                            <span className="sf-kicker">
                                <MessageCircleMore className="h-3.5 w-3.5" aria-hidden="true" />
                                Conversation desk
                            </span>
                            <h1 id="inbox-heading" className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                                One inbox for every
                                <span className="block bg-linear-to-r from-pink-200 via-white to-cyan-200 bg-clip-text text-transparent">
                                    customer conversation.
                                </span>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                                Review live provider threads, draft replies with AI, and keep response work moving without losing the active workspace context.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={conversationsLoading || isRefreshing}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/20 bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <RefreshCw className={cn("h-4 w-4", (isRefreshing || conversationsValidating) && "animate-spin")} aria-hidden="true" />
                                {isRefreshing ? "Refreshing" : "Refresh inbox"}
                            </button>
                            <Link
                                href="/dashboard/settings"
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/74 transition hover:bg-white/[0.085] hover:text-white"
                            >
                                Manage connections
                                <ArrowRight className="h-4 w-4" aria-hidden="true" />
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Live inbox status</p>
                                <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                                    {conversationsData?.account?.account_name || "Awaiting connection"}
                                </p>
                                <p className="mt-1 text-xs text-white/35">
                                    {deliveryReady ? "Reading and sending are available" : accountConnected ? "Connected with limited actions" : "Connect an account to start"}
                                </p>
                            </div>
                            <span className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                deliveryReady
                                    ? "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.7)]"
                                    : accountConnected ? "bg-amber-300" : "bg-white/20",
                            )} />
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-2">
                            <InboxMetric icon={Users} label="Threads" value={conversations.length} />
                            <InboxMetric icon={Inbox} label="Unread" value={unreadCount} />
                            <InboxMetric icon={ShieldCheck} label="Send" value={deliveryReady ? "Ready" : "Off"} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.07] bg-[#10131c] p-3 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="inline-flex w-full rounded-2xl border border-white/[0.07] bg-black/20 p-1 lg:w-auto" aria-label="Inbox platform">
                        <PlatformButton
                            active={activePlatform === "instagram"}
                            icon={Instagram}
                            label="Instagram"
                            onClick={() => handlePlatformSwitch("instagram")}
                            tone="pink"
                        />
                        <PlatformButton
                            active={activePlatform === "facebook"}
                            icon={Facebook}
                            label="Facebook"
                            onClick={() => handlePlatformSwitch("facebook")}
                            tone="cyan"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-white/36">
                        <span className={cn("h-1.5 w-1.5 rounded-full", accountConnected ? "bg-emerald-300" : "bg-white/20")} />
                        {accountConnected
                            ? `Connected as ${conversationsData?.account?.account_name}`
                            : `No ${activePlatform === "instagram" ? "Instagram" : "Facebook"} inbox connected`}
                    </div>
                </div>
            </div>

            {showRefreshingHint ? <InlineLoadingHint label="Updating conversations…" className="w-fit" /> : null}

            {showInitialLoading ? <InboxSkeleton /> : null}

            {permissionDenied && !showInitialLoading ? (
                <InboxNotice
                    icon={Lock}
                    title={`${activePlatform === "instagram" ? "Instagram" : "Facebook"} message access is limited`}
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
                    title={`${activePlatform === "instagram" ? "Instagram" : "Facebook"} needs to be reconnected`}
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
                    title={`Connect ${activePlatform === "instagram" ? "Instagram" : "Facebook"} to activate this inbox`}
                    message="The conversation desk only displays provider data for the active workspace."
                    detail="Open Settings, connect the account, and return here to load conversations."
                    tone="neutral"
                />
            ) : null}

            {!showInitialLoading && !conversationsError && !permissionDenied && !responseTokenInvalid && !noAccount && conversations.length > 0 ? (
                <div className={cn(
                    "flex min-h-[620px] flex-1 overflow-hidden rounded-[26px] border border-white/[0.08] bg-[#0d1019] shadow-[0_24px_70px_rgba(0,0,0,0.24)] transition-opacity",
                    showRefreshingHint && "opacity-95",
                )}>
                    <div className={cn(
                        "h-full w-full shrink-0 flex-col border-white/[0.07] md:flex md:w-[350px] md:border-r xl:w-[390px]",
                        showThread ? "hidden md:flex" : "flex",
                    )}>
                        <ConversationList
                            conversations={conversations}
                            selectedId={selectedConversation?.id}
                            onSelect={handleSelectConversation}
                            platform={activePlatform}
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
                            platform={activePlatform}
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
                    message={`${activePlatform === "instagram" ? "Instagram" : "Facebook"} messages will appear here as soon as the provider delivers them.`}
                    detail="Use Refresh inbox after testing a new provider conversation."
                    tone="neutral"
                />
            ) : null}
        </section>
    )
}

function InboxMetric({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof Inbox
    label: string
    value: string | number
}) {
    return (
        <div className="rounded-xl border border-white/[0.055] bg-white/[0.026] px-2 py-3 text-center">
            <Icon className="mx-auto h-3.5 w-3.5 text-white/30" aria-hidden="true" />
            <p className="mt-2 text-base font-semibold tracking-[-0.03em] text-white/82 tabular-nums">{value}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/25">{label}</p>
        </div>
    )
}

function PlatformButton({
    active,
    icon: Icon,
    label,
    onClick,
    tone,
}: {
    active: boolean
    icon: typeof Instagram
    label: string
    onClick: () => void
    tone: "pink" | "cyan"
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-xs font-semibold transition sm:min-w-36",
                active
                    ? tone === "pink"
                        ? "border border-pink-200/15 bg-pink-300/[0.09] text-pink-100"
                        : "border border-cyan-200/15 bg-cyan-300/[0.09] text-cyan-100"
                    : "border border-transparent text-white/38 hover:bg-white/[0.04] hover:text-white/66",
            )}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
        </button>
    )
}

function InboxSkeleton() {
    return (
        <div className="flex min-h-[620px] flex-1 overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#0d1019]">
            <div className="w-full space-y-2 border-r border-white/[0.06] p-3 md:w-[350px]">
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
        <div className="flex flex-1 items-center justify-center rounded-[26px] border border-dashed border-white/[0.08] bg-[#0f121b] px-5 py-14 text-center">
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
