"use client"

import { useState } from "react"
import useSWR from "swr"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import {
    X,
    Send,
    Sparkles,
    EyeOff,
    Loader2,
    MessageCircle,
    ExternalLink,
    CornerDownRight,
    User
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"

interface PostData {
    id: string
    media_type: string
    media_url: string
    thumbnail_url: string
    caption: string
    timestamp: string
    permalink: string
    comments_count: number
    like_count: number
}

interface CommentData {
    id: string
    platform_comment_id: string
    author_username: string
    message: string
    timestamp: string
    replies: CommentData[]
}

interface PostCommentsDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    post: PostData | null
    platform: string
    workspaceId: string
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch')
    return data
}

export function PostCommentsDrawer({
    open,
    onOpenChange,
    post,
    platform,
    workspaceId,
}: PostCommentsDrawerProps) {
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState("")
    const [sendingReply, setSendingReply] = useState(false)
    const [generatingAI, setGeneratingAI] = useState<string | null>(null)
    const [hidingComment, setHidingComment] = useState<string | null>(null)
    const { toast } = useToast()

    const { data, error, isLoading, mutate } = useSWR(
        open && post ? `/api/posts-media/comments?postId=${post.id}&platform=${platform}` : null,
        fetcher,
        { revalidateOnFocus: false }
    )

    const comments: CommentData[] = data?.comments || []

    const handleAIReply = async (comment: CommentData) => {
        setGeneratingAI(comment.id)
        setReplyingTo(comment.id)

        try {
            const supabase = createClient()
            const { data: aiData, error: aiError } = await supabase.functions.invoke('generate-reply', {
                body: {
                    comment: comment.message,
                    authorUsername: comment.author_username,
                    postContent: post?.caption || null,
                    platform,
                    workspaceId,
                }
            })

            if (aiError) throw aiError
            setReplyText(aiData?.reply || '')
        } catch (err) {
            console.error('AI reply generation failed:', err)
            toast({
                title: "AI reply failed",
                description: "Could not generate an AI reply. Please try again.",
                variant: "destructive",
            })
        } finally {
            setGeneratingAI(null)
        }
    }

    const handleSendReply = async (commentId: string) => {
        if (!replyText.trim()) return
        setSendingReply(true)

        try {
            const response = await fetch('/api/posts-media/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commentId,
                    message: replyText.trim(),
                    platform,
                }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to send reply')
            }

            toast({ title: "Reply sent", description: "Your reply has been posted successfully." })
            setReplyingTo(null)
            setReplyText("")
            mutate()
        } catch (err: any) {
            console.error('Reply error:', err)
            toast({
                title: "Reply failed",
                description: err.message || "Failed to send reply.",
                variant: "destructive",
            })
        } finally {
            setSendingReply(false)
        }
    }

    const handleHide = async (commentId: string) => {
        setHidingComment(commentId)
        try {
            const response = await fetch(
                `/api/posts-media/comments?commentId=${commentId}&platform=${platform}`,
                { method: 'DELETE' }
            )

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Failed to hide comment')
            }

            toast({ title: "Comment hidden", description: "The comment has been hidden." })
            mutate()
        } catch (err: any) {
            console.error('Hide error:', err)
            toast({
                title: "Hide failed",
                description: err.message || "Failed to hide comment.",
                variant: "destructive",
            })
        } finally {
            setHidingComment(null)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-lg p-0 flex flex-col border-0"
                style={{
                    background: '#0a0917',
                    borderLeft: '1px solid rgba(139,92,246,0.15)',
                }}
            >
                {/* Header */}
                <SheetHeader
                    className="px-5 py-4 flex-none space-y-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            Comments
                        </SheetTitle>
                        {post?.permalink && (
                            <a
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs transition-colors mr-8"
                                style={{ color: 'rgba(255,255,255,0.3)' }}
                            >
                                View on {platform === 'instagram' ? 'Instagram' : 'Facebook'}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </div>

                    {/* Mini post preview */}
                    {post && (
                        <div className="flex gap-3 items-start">
                            {post.media_url && (
                                <img
                                    src={post.thumbnail_url || post.media_url}
                                    alt=""
                                    className="h-14 w-14 rounded-lg object-cover flex-none"
                                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                                />
                            )}
                            <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                {post.caption || 'No caption'}
                            </p>
                        </div>
                    )}
                </SheetHeader>

                {/* Comments list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: '#8b5cf6' }} />
                        </div>
                    )}

                    {error && (
                        <div
                            className="rounded-xl p-4 text-center"
                            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                        >
                            <p className="text-sm" style={{ color: '#f87171' }}>Failed to load comments</p>
                            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{error.message}</p>
                        </div>
                    )}

                    {!isLoading && !error && comments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <MessageCircle className="h-9 w-9 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No comments yet</p>
                        </div>
                    )}

                    {comments.map((comment) => (
                        <div key={comment.id} className="space-y-2">
                            {/* Main comment */}
                            <div
                                className="rounded-xl p-3 transition-all duration-150"
                                style={{
                                    background: '#12111e',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <div className="flex items-start gap-2.5">
                                    <div
                                        className="flex-none w-7 h-7 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(139,92,246,0.15)' }}
                                    >
                                        <User className="h-3.5 w-3.5" style={{ color: '#a78bfa' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                                @{comment.author_username}
                                            </span>
                                            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }} suppressHydrationWarning>
                                                {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                            {comment.message}
                                        </p>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 mt-2.5 ml-9">
                                    <button
                                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                        style={{ color: 'rgba(255,255,255,0.35)' }}
                                        onClick={() => {
                                            setReplyingTo(replyingTo === comment.id ? null : comment.id)
                                            setReplyText("")
                                        }}
                                    >
                                        <CornerDownRight className="h-3 w-3" />
                                        Reply
                                    </button>
                                    <button
                                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                        style={{ color: 'rgba(167,139,250,0.7)' }}
                                        onClick={() => handleAIReply(comment)}
                                        disabled={generatingAI === comment.id}
                                    >
                                        {generatingAI === comment.id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-3 w-3" />
                                        )}
                                        AI Reply
                                    </button>
                                    <button
                                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                        style={{ color: 'rgba(248,113,113,0.6)' }}
                                        onClick={() => handleHide(comment.platform_comment_id)}
                                        disabled={hidingComment === comment.platform_comment_id}
                                    >
                                        {hidingComment === comment.platform_comment_id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <EyeOff className="h-3 w-3" />
                                        )}
                                        Hide
                                    </button>
                                </div>

                                {/* Reply box */}
                                {replyingTo === comment.id && (
                                    <div className="mt-3 ml-9 space-y-2">
                                        <textarea
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            placeholder="Write a reply…"
                                            rows={3}
                                            autoFocus
                                            className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none transition-all duration-150"
                                            style={{
                                                background: '#0e0d1c',
                                                border: '1px solid rgba(139,92,246,0.25)',
                                                color: 'rgba(255,255,255,0.8)',
                                            }}
                                            onFocus={(e) => { e.target.style.border = '1px solid rgba(139,92,246,0.5)' }}
                                            onBlur={(e) => { e.target.style.border = '1px solid rgba(139,92,246,0.25)' }}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50"
                                                style={{
                                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                    color: '#fff',
                                                    boxShadow: '0 2px 12px rgba(139,92,246,0.3)',
                                                }}
                                                onClick={() => handleSendReply(comment.platform_comment_id)}
                                                disabled={sendingReply || !replyText.trim()}
                                            >
                                                {sendingReply ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                                Send
                                            </button>
                                            <button
                                                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150"
                                                style={{ color: 'rgba(255,255,255,0.35)' }}
                                                onClick={() => { setReplyingTo(null); setReplyText("") }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Nested replies */}
                            {comment.replies && comment.replies.length > 0 && (
                                <div
                                    className="ml-6 space-y-2 pl-3"
                                    style={{ borderLeft: '2px solid rgba(139,92,246,0.15)' }}
                                >
                                    {comment.replies.map((reply) => (
                                        <div
                                            key={reply.id}
                                            className="rounded-lg p-2.5"
                                            style={{ background: 'rgba(255,255,255,0.02)' }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <div
                                                    className="flex-none w-5 h-5 rounded-full flex items-center justify-center"
                                                    style={{ background: 'rgba(255,255,255,0.06)' }}
                                                >
                                                    <User className="h-2.5 w-2.5" style={{ color: 'rgba(255,255,255,0.35)' }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                                            @{reply.author_username}
                                                        </span>
                                                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.22)' }} suppressHydrationWarning>
                                                            {formatDistanceToNow(new Date(reply.timestamp), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </SheetContent>
        </Sheet>
    )
}
