"use client"

import NextImage from "next/image"
import { useState, useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Send, Image as ImageIcon, Loader2, MessageSquare, Sparkles, Paperclip, ExternalLink } from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

const THREAD_THEME = {
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.05)',
    inboundBg: '#1b1d28',
    inboundText: 'rgba(255,255,255,0.78)',
    inboundMuted: 'rgba(255,255,255,0.56)',
    muted: 'rgba(255,255,255,0.5)',
    mutedSoft: 'rgba(255,255,255,0.35)',
    mutedFaint: 'rgba(255,255,255,0.25)',
    amber: '#fbbf24',
}

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
    platform_conversation_id?: string
    participant_id: string
    participant_username: string | null
    participant_profile_picture: string | null
}

interface GeneratedReplyResponse {
    reply?: string
    error?: string
}

interface MessageAttachment {
    image_data?: {
        url?: string
    }
    file_url?: string
    payload?: {
        title?: string
        description?: string
        url?: string
    }
    url?: string
    mime_type?: string
    name?: string
}

interface MessageThreadProps {
    conversation: Conversation | null
    messages: Message[]
    isLoading: boolean
    onSendMessage: (message: string) => Promise<void>
    workspaceId: string | null
    composerDisabled?: boolean
    composerDisabledReason?: string | null
}

export function MessageThread({
    conversation,
    messages,
    isLoading,
    onSendMessage,
    workspaceId,
    composerDisabled = false,
    composerDisabledReason = null,
}: MessageThreadProps) {
    const [inputValue, setInputValue] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const accent = {
        primary: '#fb7185',
        secondary: '#f59e0b',
        tint: 'rgba(251,113,133,0.16)',
        tintStrong: 'rgba(251,113,133,0.26)',
        softText: '#ffe7ee',
        focus: 'rgba(251,113,133,0.4)',
        glow: 'rgba(251,113,133,0.28)',
    }

    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight
        }
    }, [messages])

    const handleSend = async () => {
        if (!inputValue.trim() || isSending || composerDisabled) return
        setIsSending(true)
        try {
            await onSendMessage(inputValue.trim())
            setInputValue("")
        } catch {
            // Error handled by parent
        } finally {
            setIsSending(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handleAIReply = async () => {
        if (!conversation || !workspaceId || messages.length === 0) return
        const lastCustomerMessage = [...messages].reverse().find(m => !m.is_from_page && m.message)
        if (!lastCustomerMessage?.message) return

        setIsGeneratingAI(true)
        try {
            const recentMessages = messages.slice(-10).map(m => ({
                message: m.message,
                is_from_page: m.is_from_page
            }))

            const response = await fetch('/api/assistant/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    functionName: 'generate-message-reply',
                    body: {
                        message: lastCustomerMessage.message,
                        participantUsername: conversation.participant_username,
                        conversationHistory: recentMessages,
                        workspaceId,
                    },
                }),
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result?.error || 'Failed to generate AI reply')
            const data = result?.data as GeneratedReplyResponse | undefined
            if (data?.error) throw new Error(data.error)
            if (!data?.reply) throw new Error('AI returned an empty reply')
            setInputValue(data.reply)
        } catch (error) {
            console.error('AI message reply generation failed:', error)
            toast.error(error instanceof Error ? error.message : 'Could not generate an AI reply. Please try again.')
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const parseAttachments = (attachmentsStr: string): MessageAttachment[] => {
        try { return JSON.parse(attachmentsStr) } catch { return [] }
    }

    const isAttachmentPlaceholderMessage = (value: string | null | undefined) => {
        const normalized = String(value || '').trim().toLowerCase()
        return normalized === '[attachment]' || normalized === 'attachment'
    }

    const getAttachmentUrl = (att: MessageAttachment): string | null => {
        const candidates = [
            att?.image_data?.url,
            att?.file_url,
            att?.payload?.url,
            att?.url,
        ]
        const found = candidates.find((v) => typeof v === 'string' && v.trim().length > 0)
        return found || null
    }

    const isImageAttachment = (att: MessageAttachment): boolean => {
        const mime = String(att?.mime_type || '').toLowerCase()
        const url = getAttachmentUrl(att) || ''
        return mime.startsWith('image/') ||
            !!att?.image_data?.url ||
            /\.(png|jpe?g|gif|webp|heic|heif)(\?|$)/i.test(url)
    }

    const getAttachmentLabel = (att: MessageAttachment): string => {
        const payload = att?.payload || {}
        if (typeof payload?.title === 'string' && payload.title.trim()) return payload.title
        if (typeof payload?.description === 'string' && payload.description.trim()) return payload.description
        if (typeof payload?.url === 'string' && payload.url.trim()) return 'Shared link/post'
        if (typeof att?.name === 'string' && att.name.trim()) return att.name
        const mime = String(att?.mime_type || '').toLowerCase()
        if (mime.startsWith('image/')) return 'Image attachment'
        if (mime.startsWith('video/')) return 'Video attachment'
        if (mime.startsWith('audio/')) return 'Audio attachment'
        if (mime) return mime
        if (att?.image_data?.url) return 'Shared media attachment'
        return 'Attachment'
    }

    const getInstagramOpenUrl = (conversation: Conversation | null): string | null => {
        if (!conversation) return null

        const threadId = String(conversation.platform_conversation_id || '').trim()
        if (threadId) {
            return `https://www.instagram.com/direct/t/${encodeURIComponent(threadId)}`
        }

        const username = String(conversation.participant_username || '').trim().replace(/^@+/, '')
        if (username) {
            return `https://www.instagram.com/${encodeURIComponent(username)}/`
        }

        return 'https://www.instagram.com/direct/inbox/'
    }

    const hasCustomerMessage = messages.some(m => !m.is_from_page && m.message)

    // Empty state
    if (!conversation) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                    style={{ background: accent.tint, border: `1px solid ${accent.tintStrong}` }}
                >
                    <MessageSquare className="h-8 w-8" style={{ color: accent.primary }} />
                </div>
                <h3 className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Select a conversation</h3>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Choose a conversation from the list to view messages
                </p>
            </div>
        )
    }

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Thread header */}
            <div
                className="flex shrink-0 items-center gap-3 bg-white/[0.012] px-4 py-3.5"
                style={{ borderBottom: `1px solid ${THREAD_THEME.borderSoft}` }}
            >
                <Avatar className="h-9 w-9">
                    <AvatarImage src={conversation.participant_profile_picture || undefined} alt="" />
                    <AvatarFallback style={{ background: `linear-gradient(135deg, ${accent.primary}, ${accent.secondary})`, color: '#fff', fontSize: '12px' }}>
                        {(conversation.participant_username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {conversation.participant_username || 'Unknown User'}
                    </h3>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Instagram DM
                    </p>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.035),transparent_36%)] px-3 py-4 sm:px-5" ref={scrollAreaRef}>
                <div className="mx-auto min-h-full w-full max-w-4xl">
                {isLoading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                                <div
                                    className={`h-10 rounded-2xl animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-36'}`}
                                    style={{ background: 'rgba(255,255,255,0.05)' }}
                                />
                            </div>
                        ))}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10">
                        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No messages yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {messages.map((message, index) => {
                            const attachments = parseAttachments(message.attachments)
                            const hasAttachments = Array.isArray(attachments) && attachments.length > 0
                            const showMessageText = !!message.message && !(hasAttachments && isAttachmentPlaceholderMessage(message.message))
                            const showUnsupportedAttachmentPlaceholder = !showMessageText && !hasAttachments
                            const unsupportedInstagramOpenUrl = showUnsupportedAttachmentPlaceholder
                                ? getInstagramOpenUrl(conversation)
                                : null
                            const showDate = index === 0 ||
                                new Date(message.platform_created_at).toDateString() !==
                                new Date(messages[index - 1].platform_created_at).toDateString()

                            return (
                                <div key={message.id}>
                                    {showDate && (
                                        <div className="flex items-center justify-center py-2">
                                            <span
                                                className="text-[10px] font-medium px-3 py-1 rounded-full"
                                                style={{ background: 'rgba(255,255,255,0.05)', color: THREAD_THEME.mutedSoft, border: `1px solid ${THREAD_THEME.borderSoft}` }}
                                            >
                                                {format(new Date(message.platform_created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                    )}

                                    <div className={`flex gap-2 group ${message.is_from_page ? 'justify-end' : 'justify-start'}`}>
                                        {!message.is_from_page && (
                                            <Avatar className="h-7 w-7 shrink-0">
                                                <AvatarImage src={conversation.participant_profile_picture || undefined} alt="" />
                                                <AvatarFallback style={{ background: 'rgba(255,255,255,0.08)', color: THREAD_THEME.muted, fontSize: '10px' }}>
                                                    {(conversation.participant_username || 'U')[0].toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}

                                        <div className={`max-w-[70%] space-y-1 ${message.is_from_page ? 'items-end' : ''}`}>
                                            {showMessageText && (
                                                <div
                                                    className="px-3.5 py-2.5 rounded-2xl text-sm"
                                                    style={
                                                        message.is_from_page
                                                            ? {
                                                                background: `linear-gradient(135deg, ${accent.primary}, ${accent.secondary})`,
                                                                color: '#fff',
                                                                borderBottomRightRadius: '4px',
                                                                boxShadow: `0 2px 14px ${accent.glow}`,
                                                            }
                                                            : {
                                                                background: THREAD_THEME.inboundBg,
                                                                color: THREAD_THEME.inboundText,
                                                                border: `1px solid ${THREAD_THEME.border}`,
                                                                borderBottomLeftRadius: '4px',
                                                            }
                                                    }
                                                >
                                                    <p className="whitespace-pre-wrap wrap-break-word">{message.message}</p>
                                                </div>
                                            )}

                                            {showUnsupportedAttachmentPlaceholder && (
                                                <div
                                                    className="px-3.5 py-2 rounded-2xl text-xs space-y-2"
                                                    style={
                                                        message.is_from_page
                                                            ? {
                                                                background: accent.tint,
                                                                color: accent.softText,
                                                                borderBottomRightRadius: '4px',
                                                                border: `1px solid ${accent.tintStrong}`,
                                                            }
                                                            : {
                                                                background: THREAD_THEME.inboundBg,
                                                                color: THREAD_THEME.inboundMuted,
                                                                border: `1px solid ${THREAD_THEME.border}`,
                                                                borderBottomLeftRadius: '4px',
                                                            }
                                                    }
                                                >
                                                    <div>[Unsupported IG attachment/share]</div>
                                                    {unsupportedInstagramOpenUrl && (
                                                        <a
                                                            href={unsupportedInstagramOpenUrl}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold"
                                                            style={{
                                                                background: message.is_from_page ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
                                                                color: message.is_from_page ? accent.softText : 'rgba(255,255,255,0.72)',
                                                                border: `1px solid ${THREAD_THEME.border}`,
                                                            }}
                                                            title="Open this conversation in Instagram (best effort)"
                                                        >
                                                            Open in Instagram
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    )}
                                                </div>
                                            )}

                                            {attachments.length > 0 && (
                                                <div className="space-y-1">
                                                    {attachments.map((att, i: number) => (
                                                        <div key={i} className="space-y-1.5">
                                                            {(() => {
                                                                const attachmentUrl = getAttachmentUrl(att)
                                                                const label = getAttachmentLabel(att)
                                                                const isImage = isImageAttachment(att) && !!attachmentUrl
                                                                const bubbleStyle = message.is_from_page
                                                                    ? { background: accent.tintStrong, color: accent.softText }
                                                                    : { background: THREAD_THEME.inboundBg, color: THREAD_THEME.inboundMuted, border: `1px solid ${THREAD_THEME.border}` }

                                                                if (isImage) {
                                                                    return (
                                                                        <a
                                                                            href={attachmentUrl!}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="block rounded-xl overflow-hidden"
                                                                            style={{
                                                                                ...(message.is_from_page
                                                                                    ? { background: accent.tint }
                                                                                    : { background: THREAD_THEME.inboundBg, border: `1px solid ${THREAD_THEME.border}` }),
                                                                            }}
                                                                        >
                                                                            <NextImage
                                                                                src={attachmentUrl!}
                                                                                alt={label}
                                                                                width={260}
                                                                                height={256}
                                                                                unoptimized
                                                                                className="block w-full max-w-[260px] max-h-64 object-cover"
                                                                                loading="lazy"
                                                                                onError={(e) => {
                                                                                    e.currentTarget.style.display = 'none'
                                                                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null
                                                                                    if (fallback) fallback.style.display = 'flex'
                                                                                }}
                                                                            />
                                                                            <div
                                                                                className="hidden items-center gap-2 px-3 py-2 text-xs"
                                                                                style={bubbleStyle}
                                                                            >
                                                                                <ImageIcon className="h-3.5 w-3.5" />
                                                                                <span className="truncate">{label}</span>
                                                                                <ExternalLink className="h-3.5 w-3.5 ml-auto shrink-0" />
                                                                            </div>
                                                                            <div
                                                                                className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                                                                                style={{
                                                                                    borderTop: '1px solid rgba(255,255,255,0.06)',
                                                                                    ...bubbleStyle
                                                                                }}
                                                                            >
                                                                                <span className="truncate">{label}</span>
                                                                                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                                                                            </div>
                                                                        </a>
                                                                    )
                                                                }

                                                                return (
                                                                    <div
                                                                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                                                                        style={bubbleStyle}
                                                                    >
                                                                        <Paperclip className="h-4 w-4 shrink-0" />
                                                                        <span className="text-xs truncate flex-1">{label}</span>
                                                                        {attachmentUrl && (
                                                                            <a
                                                                                href={attachmentUrl}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="inline-flex items-center gap-1 text-[10px] font-semibold shrink-0"
                                                                                style={{ color: message.is_from_page ? accent.softText : 'rgba(255,255,255,0.65)' }}
                                                                            >
                                                                                Open
                                                                                <ExternalLink className="h-3 w-3" />
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                )
                                                            })()}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <p
                                                className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${message.is_from_page ? 'text-right' : ''}`}
                                                style={{ color: THREAD_THEME.mutedFaint }}
                                            >
                                                {format(new Date(message.platform_created_at), 'h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
                </div>
            </ScrollArea>

            {/* Input */}
            <div
                className="shrink-0 bg-[#0b0e16]/90 p-3.5"
                style={{ borderTop: `1px solid ${THREAD_THEME.borderSoft}` }}
            >
                <div className="mx-auto w-full max-w-4xl">
                {composerDisabled && (
                    <div
                        className="mb-2.5 rounded-lg px-3 py-2 text-xs"
                        style={{
                            background: 'rgba(245,158,11,0.08)',
                            border: '1px solid rgba(245,158,11,0.18)',
                            color: 'rgba(253,230,138,0.92)',
                        }}
                    >
                        {composerDisabledReason || 'Messaging is currently unavailable for this account.'}
                    </div>
                )}
                <div className="flex gap-2">
                    <textarea
                        placeholder="Type a message…"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={composerDisabled}
                        rows={1}
                        className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-150 placeholder:text-white/22"
                        style={{
                            background: composerDisabled ? 'rgba(255,255,255,0.03)' : THREAD_THEME.panelAlt,
                            border: `1px solid ${THREAD_THEME.border}`,
                            color: composerDisabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)',
                        }}
                        onFocus={(e) => { e.target.style.border = `1px solid ${accent.focus}` }}
                        onBlur={(e) => { e.target.style.border = `1px solid ${THREAD_THEME.border}` }}
                    />

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleAIReply}
                                    disabled={isGeneratingAI || !hasCustomerMessage || !workspaceId || composerDisabled}
                                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40"
                                    style={{
                                        background: 'rgba(245,158,11,0.10)',
                                        border: '1px solid rgba(245,158,11,0.22)',
                                        color: THREAD_THEME.amber,
                                    }}
                                >
                                    {isGeneratingAI ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                </button>
                            </TooltipTrigger>
                            <TooltipContent><p>AI Reply</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isSending || composerDisabled}
                        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40"
                        style={{
                            background: `linear-gradient(135deg, ${accent.primary}, ${accent.secondary})`,
                            color: '#fff',
                            boxShadow: `0 2px 14px ${accent.glow}`,
                        }}
                    >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
                </div>
            </div>
        </div>
    )
}
