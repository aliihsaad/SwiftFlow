"use client"

import { useState, useRef, useEffect } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Send, Image, Loader2, MessageSquare, Sparkles } from "lucide-react"
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
    platform?: string
}

export function MessageThread({ conversation, messages, isLoading, onSendMessage, workspaceId: propWorkspaceId, platform = 'instagram' }: MessageThreadProps) {
    const [inputValue, setInputValue] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const [internalWorkspaceId, setInternalWorkspaceId] = useState<string | null>(null)

    const workspaceId = propWorkspaceId || internalWorkspaceId

    useEffect(() => {
        if (propWorkspaceId) return
        const fetchWorkspace = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .limit(1)
                .single()
            if (data) setInternalWorkspaceId(data.workspace_id)
        }
        fetchWorkspace()
    }, [propWorkspaceId])

    useEffect(() => {
        if (scrollAreaRef.current) {
            const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight
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
        const lastCustomerMessage = [...messages].reverse().find(m => !m.is_from_page && m.message)
        if (!lastCustomerMessage?.message) return

        setIsGeneratingAI(true)
        try {
            const supabase = createClient()
            const recentMessages = messages.slice(-10).map(m => ({
                message: m.message,
                is_from_page: m.is_from_page
            }))

            const { data, error } = await supabase.functions.invoke('generate-message-reply', {
                body: {
                    message: lastCustomerMessage.message,
                    participantUsername: conversation.participant_username,
                    conversationHistory: recentMessages,
                    platform,
                    workspaceId
                }
            })

            if (error) throw error
            if (data?.reply) setInputValue(data.reply)
        } catch (error) {
            console.error('AI message reply generation failed:', error)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const parseAttachments = (attachmentsStr: string) => {
        try { return JSON.parse(attachmentsStr) } catch { return [] }
    }

    const hasCustomerMessage = messages.some(m => !m.is_from_page && m.message)

    // Empty state
    if (!conversation) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center" style={{ background: 'rgba(255,255,255,0.01)' }}>
                <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl mb-4"
                    style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}
                >
                    <MessageSquare className="h-8 w-8" style={{ color: '#8b5cf6' }} />
                </div>
                <h3 className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>Select a conversation</h3>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Choose a conversation from the list to view messages
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Thread header */}
            <div
                className="shrink-0 flex items-center gap-3 px-4 py-3"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
                <Avatar className="h-9 w-9">
                    <AvatarImage src={conversation.participant_profile_picture || undefined} />
                    <AvatarFallback style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', fontSize: '12px' }}>
                        {(conversation.participant_username || 'U')[0].toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        {conversation.participant_username || 'Unknown User'}
                    </h3>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {platform === 'instagram' ? 'Instagram' : 'Facebook'} DM
                    </p>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0 px-4 py-4" ref={scrollAreaRef}>
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
                            const showDate = index === 0 ||
                                new Date(message.platform_created_at).toDateString() !==
                                new Date(messages[index - 1].platform_created_at).toDateString()

                            return (
                                <div key={message.id}>
                                    {showDate && (
                                        <div className="flex items-center justify-center py-2">
                                            <span
                                                className="text-[10px] font-medium px-3 py-1 rounded-full"
                                                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}
                                            >
                                                {format(new Date(message.platform_created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                    )}

                                    <div className={`flex gap-2 group ${message.is_from_page ? 'justify-end' : 'justify-start'}`}>
                                        {!message.is_from_page && (
                                            <Avatar className="h-7 w-7 shrink-0">
                                                <AvatarImage src={conversation.participant_profile_picture || undefined} />
                                                <AvatarFallback style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', fontSize: '10px' }}>
                                                    {(conversation.participant_username || 'U')[0].toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                        )}

                                        <div className={`max-w-[70%] space-y-1 ${message.is_from_page ? 'items-end' : ''}`}>
                                            {message.message && (
                                                <div
                                                    className="px-3.5 py-2.5 rounded-2xl text-sm"
                                                    style={
                                                        message.is_from_page
                                                            ? {
                                                                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                                  color: '#fff',
                                                                  borderBottomRightRadius: '4px',
                                                                  boxShadow: '0 2px 12px rgba(139,92,246,0.25)',
                                                              }
                                                            : {
                                                                  background: '#1a1830',
                                                                  color: 'rgba(255,255,255,0.75)',
                                                                  border: '1px solid rgba(255,255,255,0.07)',
                                                                  borderBottomLeftRadius: '4px',
                                                              }
                                                    }
                                                >
                                                    <p className="whitespace-pre-wrap break-words">{message.message}</p>
                                                </div>
                                            )}

                                            {attachments.length > 0 && (
                                                <div className="space-y-1">
                                                    {attachments.map((att: any, i: number) => (
                                                        <div
                                                            key={i}
                                                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                                                            style={
                                                                message.is_from_page
                                                                    ? { background: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }
                                                                    : { background: '#1a1830', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.07)' }
                                                            }
                                                        >
                                                            <Image className="h-4 w-4" />
                                                            <span className="text-xs">[Attachment]</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            <p
                                                className={`text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${message.is_from_page ? 'text-right' : ''}`}
                                                style={{ color: 'rgba(255,255,255,0.25)' }}
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
            </ScrollArea>

            {/* Input */}
            <div
                className="shrink-0 p-3"
                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
                <div className="flex gap-2">
                    <textarea
                        placeholder="Type a message…"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        className="flex-1 min-h-[44px] max-h-32 resize-none rounded-xl px-3.5 py-2.5 text-sm outline-none transition-all duration-150"
                        style={{
                            background: '#12111e',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.8)',
                        }}
                        onFocus={(e) => { e.target.style.border = '1px solid rgba(139,92,246,0.4)' }}
                        onBlur={(e) => { e.target.style.border = '1px solid rgba(255,255,255,0.08)' }}
                    />

                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    onClick={handleAIReply}
                                    disabled={isGeneratingAI || !hasCustomerMessage || !workspaceId}
                                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40"
                                    style={{
                                        background: 'rgba(139,92,246,0.12)',
                                        border: '1px solid rgba(139,92,246,0.25)',
                                        color: '#a78bfa',
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
                        disabled={!inputValue.trim() || isSending}
                        className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 disabled:opacity-40"
                        style={{
                            background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                            color: '#fff',
                            boxShadow: '0 2px 12px rgba(139,92,246,0.3)',
                        }}
                    >
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    )
}
