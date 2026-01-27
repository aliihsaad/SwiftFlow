"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
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
    if (conversations.length === 0) {
        return (
            <div className="flex items-center justify-center h-full p-6 text-center">
                <p className="text-sm text-muted-foreground">No conversations</p>
            </div>
        )
    }

    return (
        <ScrollArea className="h-full">
            <div className="divide-y divide-border/50">
                {conversations.map((conversation) => (
                    <button
                        key={conversation.id}
                        onClick={() => onSelect(conversation)}
                        className={cn(
                            "w-full flex items-start gap-3 p-4 text-left transition-colors hover:bg-muted/50",
                            selectedId === conversation.id && "bg-muted"
                        )}
                    >
                        {/* Avatar */}
                        <Avatar className="h-10 w-10 shrink-0">
                            <AvatarImage src={conversation.participant_profile_picture || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white">
                                {(conversation.participant_username || 'U')[0].toUpperCase()}
                            </AvatarFallback>
                        </Avatar>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                                <span className={cn(
                                    "font-medium text-sm truncate",
                                    conversation.unread_count > 0 && "font-semibold"
                                )}>
                                    {conversation.participant_username || 'Unknown User'}
                                </span>
                                <span className="text-xs text-muted-foreground shrink-0">
                                    {formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: false })}
                                </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <p className={cn(
                                    "text-xs truncate",
                                    conversation.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                                )}>
                                    {conversation.lastMessage ? (
                                        <>
                                            {conversation.lastMessage.is_from_page && (
                                                <span className="text-muted-foreground">You: </span>
                                            )}
                                            {conversation.lastMessage.message || '[Attachment]'}
                                        </>
                                    ) : (
                                        'No messages'
                                    )}
                                </p>

                                {conversation.unread_count > 0 && (
                                    <Badge className="h-5 min-w-5 p-0 flex items-center justify-center bg-pink-500 hover:bg-pink-500 text-xs">
                                        {conversation.unread_count}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        </ScrollArea>
    )
}
