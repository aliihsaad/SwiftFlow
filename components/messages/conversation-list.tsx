"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { formatDistanceToNow } from "date-fns"

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

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
    const isAttachmentPlaceholderMessage = (value: string | null | undefined) => {
        const normalized = String(value || '').trim().toLowerCase()
        return normalized === '[attachment]' || normalized === 'attachment'
    }

    const parseAttachments = (attachmentsStr: string) => {
        try { return JSON.parse(attachmentsStr || '[]') } catch { return [] }
    }

    const attachmentPreviewLabel = (attachmentsStr: string) => {
        const attachments = parseAttachments(attachmentsStr)
        if (!Array.isArray(attachments) || attachments.length === 0) return '[Unsupported IG attachment/share]'

        const first = attachments[0] || {}
        const mime = String(first?.mime_type || '').toLowerCase()
        const payload = first?.payload || {}

        if (typeof payload?.title === 'string' && payload.title.trim()) {
            return payload.title
        }
        if (typeof payload?.url === 'string' && payload.url.trim()) {
            return '[Shared link/post]'
        }
        if (mime.startsWith('image/') || first?.image_data?.url) return '[Photo]'
        if (mime.startsWith('video/') || first?.video_data?.url) return '[Video]'
        if (mime.startsWith('audio/') || first?.audio_data?.url) return '[Audio]'
        if (typeof first?.name === 'string' && first.name.trim()) return `[File] ${first.name}`
        return '[Unsupported IG attachment/share]'
    }

    if (conversations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full p-6 text-center">
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No conversations</p>
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div>
                {conversations.map((conversation, index) => {
                    const isSelected = selectedId === conversation.id
                    const hasUnread = conversation.unread_count > 0

                    return (
                        <button
                            key={conversation.id}
                            onClick={() => onSelect(conversation)}
                            className="relative w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all duration-150"
                            style={{
                                background: isSelected ? 'rgba(139,92,246,0.1)' : 'transparent',
                                borderBottom: index < conversations.length - 1 ? '1px solid rgba(255,255,255,0.04)' : undefined,
                            }}
                        >
                            {/* Selected indicator */}
                            {isSelected && (
                                <div
                                    className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r"
                                    style={{ background: '#8b5cf6' }}
                                />
                            )}

                            {/* Avatar */}
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={conversation.participant_profile_picture || undefined} />
                                <AvatarFallback style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', fontSize: '13px' }}>
                                    {(conversation.participant_username || 'U')[0].toUpperCase()}
                                </AvatarFallback>
                            </Avatar>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                    <span
                                        className="text-sm truncate"
                                        style={{
                                            color: hasUnread ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.65)',
                                            fontWeight: hasUnread ? 600 : 500,
                                        }}
                                    >
                                        {conversation.participant_username || 'Unknown User'}
                                    </span>
                                    <span className="text-[10px] shrink-0" style={{ color: 'rgba(255,255,255,0.25)' }} suppressHydrationWarning>
                                        {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between gap-2">
                                    <p
                                        className="text-xs truncate"
                                        style={{ color: hasUnread ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}
                                    >
                                        {conversation.lastMessage ? (
                                            <>
                                                {conversation.lastMessage.is_from_page && (
                                                    <span style={{ color: 'rgba(255,255,255,0.25)' }}>You: </span>
                                                )}
                                                {(!isAttachmentPlaceholderMessage(conversation.lastMessage.message) && conversation.lastMessage.message)
                                                    ? conversation.lastMessage.message
                                                    : attachmentPreviewLabel(conversation.lastMessage.attachments)}
                                            </>
                                        ) : (
                                            'No messages'
                                        )}
                                    </p>

                                    {hasUnread && (
                                        <span
                                            className="h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                                            style={{ background: '#ec4899', color: '#fff' }}
                                        >
                                            {conversation.unread_count}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>
        </ScrollArea>
    )
}
