"use client"

import { useMemo, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Inbox, Search, SlidersHorizontal } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

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

interface ConversationListProps {
    conversations: Conversation[]
    selectedId: string | undefined
    onSelect: (conversation: Conversation) => void
}

type QueueFilter = "all" | "unread"

function parseAttachments(attachments: string) {
    try {
        return JSON.parse(attachments || "[]")
    } catch {
        return []
    }
}

function isAttachmentPlaceholder(message: string | null | undefined) {
    const normalized = String(message || "").trim().toLowerCase()
    return normalized === "[attachment]" || normalized === "attachment"
}

function attachmentPreviewLabel(attachments: string) {
    const parsed = parseAttachments(attachments)
    if (!Array.isArray(parsed) || parsed.length === 0) return "Shared attachment"

    const first = parsed[0] || {}
    const mime = String(first?.mime_type || "").toLowerCase()
    const payload = first?.payload || {}
    if (typeof payload?.title === "string" && payload.title.trim()) return payload.title
    if (typeof payload?.url === "string" && payload.url.trim()) return "Shared link or post"
    if (mime.startsWith("image/") || first?.image_data?.url) return "Photo"
    if (mime.startsWith("video/") || first?.video_data?.url) return "Video"
    if (mime.startsWith("audio/") || first?.audio_data?.url) return "Audio"
    if (typeof first?.name === "string" && first.name.trim()) return first.name
    return "Shared attachment"
}

export function ConversationList({
    conversations,
    selectedId,
    onSelect,
}: ConversationListProps) {
    const [query, setQuery] = useState("")
    const [filter, setFilter] = useState<QueueFilter>("all")
    const unreadConversations = conversations.filter((conversation) => conversation.unread_count > 0).length

    const visibleConversations = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase()
        return conversations.filter((conversation) => {
            if (filter === "unread" && conversation.unread_count <= 0) return false
            if (!normalizedQuery) return true
            const preview = conversation.lastMessage?.message || attachmentPreviewLabel(conversation.lastMessage?.attachments || "")
            return [conversation.participant_username || "", preview]
                .join(" ")
                .toLocaleLowerCase()
                .includes(normalizedQuery)
        })
    }, [conversations, filter, query])

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b border-white/[0.06] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold tracking-[-0.01em] text-white/80">Conversation queue</p>
                        <p className="mt-1 text-[11px] text-white/30">{conversations.length} total · {unreadConversations} unread</p>
                    </div>
                    <span className="rounded-full border border-pink-200/15 bg-pink-300/[0.08] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.13em] text-pink-100/70">
                        IG
                    </span>
                </div>

                <label className="relative mt-3 block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" aria-hidden="true" />
                    <span className="sr-only">Search conversations</span>
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search conversations"
                        className="h-9 w-full rounded-xl border border-white/[0.075] bg-white/[0.035] pl-9 pr-3 text-xs text-white/76 outline-none transition placeholder:text-white/24 focus:border-cyan-200/20 focus:bg-white/[0.05]"
                    />
                </label>

                <div className="mt-2 flex items-center gap-2">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-white/23" aria-hidden="true" />
                    <QueueButton active={filter === "all"} label="All" count={conversations.length} onClick={() => setFilter("all")} />
                    <QueueButton active={filter === "unread"} label="Unread" count={unreadConversations} onClick={() => setFilter("unread")} />
                </div>
            </div>

            {visibleConversations.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center p-7 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.025] text-white/20">
                        <Inbox className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <p className="mt-4 text-sm font-semibold text-white/52">No matching conversations</p>
                    <p className="mt-1 text-xs leading-5 text-white/27">Clear the search or switch back to the full queue.</p>
                </div>
            ) : (
                <ScrollArea className="min-h-0 flex-1">
                    <div className="p-2">
                        {visibleConversations.map((conversation) => {
                            const isSelected = selectedId === conversation.id
                            const hasUnread = conversation.unread_count > 0
                            const preview = conversation.lastMessage
                                ? !isAttachmentPlaceholder(conversation.lastMessage.message) && conversation.lastMessage.message
                                    ? conversation.lastMessage.message
                                    : attachmentPreviewLabel(conversation.lastMessage.attachments)
                                : "No messages yet"

                            return (
                                <button
                                    key={conversation.id}
                                    type="button"
                                    onClick={() => onSelect(conversation)}
                                    className={cn(
                                        "group relative mb-1 flex w-full items-start gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left transition",
                                        isSelected
                                            ? "border-cyan-200/15 bg-cyan-300/[0.065] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                            : "border-transparent hover:border-white/[0.06] hover:bg-white/[0.028]",
                                    )}
                                >
                                    {isSelected ? <span className="absolute inset-y-3 left-0 w-0.5 rounded-r bg-cyan-200/70" /> : null}
                                    <div className="relative shrink-0">
                                        <Avatar className="h-10 w-10 border border-white/[0.07]">
                                            <AvatarImage src={conversation.participant_profile_picture || undefined} alt="" />
                                            <AvatarFallback className="bg-linear-to-br from-violet-500 to-cyan-400 text-xs font-semibold text-white">
                                                {(conversation.participant_username || "U")[0].toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        {hasUnread ? <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0d1019] bg-pink-400" /> : null}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={cn("truncate text-sm", hasUnread ? "font-semibold text-white/86" : "font-medium text-white/62")}>
                                                {conversation.participant_username || "Unknown user"}
                                            </span>
                                            <span className="shrink-0 text-[10px] text-white/23" suppressHydrationWarning>
                                                {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })}
                                            </span>
                                        </div>
                                        <div className="mt-1 flex items-center gap-2">
                                            <p className={cn("min-w-0 flex-1 truncate text-xs", hasUnread ? "text-white/48" : "text-white/30")}>
                                                {conversation.lastMessage?.is_from_page ? <span className="text-cyan-100/40">You: </span> : null}
                                                {preview}
                                            </p>
                                            {hasUnread ? (
                                                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-pink-400 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                                                    {conversation.unread_count}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </ScrollArea>
            )}
        </div>
    )
}

function QueueButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition",
                active
                    ? "border-white/[0.11] bg-white/[0.07] text-white/70"
                    : "border-transparent text-white/30 hover:bg-white/[0.035] hover:text-white/55",
            )}
        >
            {label}
            <span className="tabular-nums text-white/28">{count}</span>
        </button>
    )
}
