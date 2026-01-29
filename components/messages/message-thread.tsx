"use client"

import { useState, useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Send, Image, Loader2, MessageSquare, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { createClient } from "@/utils/supabase/client"

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
    participant_id: string
    participant_username: string | null
    participant_profile_picture: string | null
}

interface MessageThreadProps {
    conversation: Conversation | null
    messages: Message[]
    isLoading: boolean
    onSendMessage: (message: string) => Promise<void>
    workspaceId: string | null
}

export function MessageThread({ conversation, messages, isLoading, onSendMessage, workspaceId }: MessageThreadProps) {
    const [inputValue, setInputValue] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)

    // Scroll to bottom when messages change
    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight
            }
        }
    }, [messages])

    const handleSend = async () => {
        if (!inputValue.trim() || isSending) return

        setIsSending(true)
        try {
            await onSendMessage(inputValue.trim())
            setInputValue("")
        } catch (error) {
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

        // Find the last message from the customer to reply to
        const lastCustomerMessage = [...messages].reverse().find(m => !m.is_from_page && m.message)
        if (!lastCustomerMessage?.message) return

        setIsGeneratingAI(true)
        try {
            const supabase = createClient()

            // Get recent conversation history (last 10 messages for context)
            const recentMessages = messages.slice(-10).map(m => ({
                message: m.message,
                is_from_page: m.is_from_page
            }))

            const { data, error } = await supabase.functions.invoke('generate-message-reply', {
                body: {
                    message: lastCustomerMessage.message,
                    participantUsername: conversation.participant_username,
                    conversationHistory: recentMessages,
                    platform: 'instagram',
                    workspaceId
                }
            })

            if (error) throw error
            if (data?.reply) {
                setInputValue(data.reply)
            }
        } catch (error) {
            console.error('AI message reply generation failed:', error)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    // Empty state - no conversation selected
    if (!conversation) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-muted/20">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium text-foreground">Select a conversation</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Choose a conversation from the list to view messages
                </p>
            </div>
        )
    }

    // Parse attachments
    const parseAttachments = (attachmentsStr: string) => {
        try {
            return JSON.parse(attachmentsStr)
        } catch {
            return []
        }
    }

    // Check if there's a customer message to generate AI reply for
    const hasCustomerMessage = messages.some(m => !m.is_from_page && m.message)

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 border-b">
                <Avatar className="h-9 w-9">
                    <AvatarImage src={conversation.participant_profile_picture || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-500 text-white text-sm">
                        {(conversation.participant_username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-medium text-sm">
                        {conversation.participant_username || 'Unknown User'}
                    </h3>
                    <p className="text-xs text-muted-foreground">Instagram DM</p>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
                {isLoading ? (
                    <div className="space-y-4">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "justify-start" : "justify-end")}>
                                <Skeleton className={cn("h-10 rounded-2xl", i % 2 === 0 ? "w-48" : "w-36")} />
                            </div>
                        ))}
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <p className="text-sm text-muted-foreground">No messages yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {messages.map((message, index) => {
                            const attachments = parseAttachments(message.attachments)
                            const showDate = index === 0 ||
                                new Date(message.platform_created_at).toDateString() !==
                                new Date(messages[index - 1].platform_created_at).toDateString()

                            return (
                                <div key={message.id}>
                                    {/* Date separator */}
                                    {showDate && (
                                        <div className="flex items-center justify-center py-2">
                                            <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                                {format(new Date(message.platform_created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Message bubble */}
                                    <div className={cn(
                                        "flex gap-2 group",
                                        message.is_from_page ? "justify-end" : "justify-start"
                                    )}>
                                        {!message.is_from_page && (
                                            <Avatar className="h-7 w-7 shrink-0">
                                                <AvatarImage src={conversation.participant_profile_picture || undefined} />
                                                <AvatarFallback className="text-xs bg-muted">
                                                    {(conversation.participant_username || 'U')[0].toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}

                                        <div className={cn(
                                            "max-w-[70%] space-y-1",
                                            message.is_from_page && "items-end"
                                        )}>
                                            {/* Text message */}
                                            {message.message && (
                                                <div className={cn(
                                                    "px-3 py-2 rounded-2xl text-sm",
                                                    message.is_from_page
                                                        ? "bg-pink-500 text-white rounded-br-sm"
                                                        : "bg-muted rounded-bl-sm"
                                                )}>
                                                    <p className="whitespace-pre-wrap break-words">
                                                        {message.message}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Attachments */}
                                            {attachments.length > 0 && (
                                                <div className="space-y-1">
                                                    {attachments.map((att: any, i: number) => (
                                                        <div key={i} className={cn(
                                                            "flex items-center gap-2 px-3 py-2 rounded-xl text-sm",
                                                            message.is_from_page ? "bg-pink-500/80 text-white" : "bg-muted"
                                                        )}>
                                                            <Image className="h-4 w-4" />
                                                            <span className="text-xs">[Attachment]</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Timestamp */}
                                            <p className={cn(
                                                "text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity",
                                                message.is_from_page && "text-right"
                                            )}>
                                                {format(new Date(message.platform_created_at), 'h:mm a')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-4 border-t">
                <div className="flex gap-2">
                    <Textarea
                        placeholder="Type a message..."
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="min-h-[44px] max-h-32 resize-none"
                        rows={1}
                    />
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    size="icon"
                                    variant="outline"
                                    onClick={handleAIReply}
                                    disabled={isGeneratingAI || !hasCustomerMessage || !workspaceId}
                                    className="h-11 w-11 shrink-0 text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                                >
                                    {isGeneratingAI ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>AI Reply</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                    <Button
                        size="icon"
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isSending}
                        className="h-11 w-11 shrink-0 bg-pink-500 hover:bg-pink-600"
                    >
                        {isSending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    )
}
