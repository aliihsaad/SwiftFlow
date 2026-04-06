"use client"

import { useState } from "react"
import {
    ChevronLeft,
    ChevronRight,
    Reply,
    EyeOff,
    Send,
    X,
    Instagram,
    Facebook,
    Clock,
    CheckCircle,
    Sparkles,
    ExternalLink,
    Image as ImageIcon,
    Loader2
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"

interface PostInfo {
    published_post_id: string
    platform_post_id: string
    permalink: string | null
    content: string
    media_urls: string[]
}

interface Comment {
    id: string
    platform_comment_id: string
    author_username: string | null
    author_profile_picture: string | null
    message: string
    is_hidden: boolean
    replied_at: string | null
    platform_created_at: string
    social_accounts: {
        platform: string
        account_name: string
    } | null
    replies: Comment[]
    post: PostInfo | null
}

interface GeneratedReplyResponse {
    reply?: string
    error?: string
}

interface CommentsListProps {
    comments: Comment[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
    onPageChange: (page: number) => void
    onReply: (commentId: string, message: string) => Promise<void>
    onHide: (commentId: string) => Promise<void>
    workspaceId: string
}

export function CommentsList({
    comments,
    pagination,
    onPageChange,
    onReply,
    onHide,
    workspaceId
}: CommentsListProps) {
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [generatingAI, setGeneratingAI] = useState<string | null>(null)

    const handleSubmitReply = async (commentId: string) => {
        if (!replyText.trim()) return
        setIsSubmitting(true)
        try {
            await onReply(commentId, replyText)
            setReplyText("")
            setReplyingTo(null)
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAIReply = async (comment: Comment) => {
        setGeneratingAI(comment.id)
        setReplyingTo(comment.id)

        try {
            const response = await fetch('/api/assistant/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    functionName: 'generate-reply',
                    body: {
                        comment: comment.message,
                        authorUsername: comment.author_username,
                        postContent: comment.post?.content || null,
                        platform: comment.social_accounts?.platform || 'instagram',
                        workspaceId,
                    },
                }),
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result?.error || 'Failed to generate AI reply')
            const data = result?.data as GeneratedReplyResponse | undefined
            if (data?.error) throw new Error(data.error)
            if (!data?.reply) throw new Error('AI returned an empty reply')
            setReplyText(data.reply)
        } catch (error) {
            console.error('AI reply generation failed:', error)
            toast.error(error instanceof Error ? error.message : 'Could not generate an AI reply. Please try again.')
        } finally {
            setGeneratingAI(null)
        }
    }

    const PlatformIcon = ({ platform }: { platform: string }) => {
        if (platform === 'instagram') return <Instagram className="h-3.5 w-3.5" />
        return <Facebook className="h-3.5 w-3.5" />
    }

    const getFirstMediaUrl = (mediaUrls: string[]): string | null => {
        if (!mediaUrls || mediaUrls.length === 0) return null
        return mediaUrls[0] || null
    }

    return (
        <div className="space-y-4">
            {comments.map((comment) => (
                <div
                    key={comment.id}
                    className="rounded-xl overflow-hidden transition-opacity"
                    style={{
                        background: '#0e0d1c',
                        border: '1px solid rgba(255,255,255,0.06)',
                        opacity: comment.is_hidden ? 0.5 : 1,
                    }}
                >
                    <div className="p-4">
                        {/* Post Preview */}
                        {comment.post && (
                            <div
                                className="mb-3 rounded-lg p-3"
                                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
                            >
                                <div className="flex gap-3">
                                    {getFirstMediaUrl(comment.post.media_urls) ? (
                                        <img
                                            src={getFirstMediaUrl(comment.post.media_urls)!}
                                            alt="Post"
                                            className="w-14 h-14 object-cover rounded-lg shrink-0"
                                        />
                                    ) : (
                                        <div
                                            className="w-14 h-14 rounded-lg flex items-center justify-center shrink-0"
                                            style={{ background: 'rgba(255,255,255,0.05)' }}
                                        >
                                            <ImageIcon className="h-5 w-5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                                        </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] mb-1 uppercase tracking-wider font-semibold" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                            Comment on post
                                        </p>
                                        <p className="text-xs line-clamp-2" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                            {comment.post.content || 'No caption'}
                                        </p>
                                        {comment.post.permalink && (
                                            <a
                                                href={comment.post.permalink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[10px] mt-1 transition-colors"
                                                style={{ color: '#a78bfa' }}
                                            >
                                                View post <ExternalLink className="h-2.5 w-2.5" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-3">
                            {/* Avatar */}
                            <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={comment.author_profile_picture || undefined} />
                                <AvatarFallback style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff', fontSize: '12px' }}>
                                    {(comment.author_username || 'U')[0].toUpperCase()}
                                </AvatarFallback>
                            </Avatar>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                {/* Header */}
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                        {comment.author_username || 'Unknown User'}
                                    </span>

                                    {comment.social_accounts && (
                                        <span
                                            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                                            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.08)' }}
                                        >
                                            <PlatformIcon platform={comment.social_accounts.platform} />
                                            {comment.social_accounts.account_name}
                                        </span>
                                    )}

                                    <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }} suppressHydrationWarning>
                                        <Clock className="h-2.5 w-2.5" />
                                        {formatDistanceToNow(new Date(comment.platform_created_at), { addSuffix: true })}
                                    </span>

                                    {comment.replied_at && (
                                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(52,211,153,0.1)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                                            <CheckCircle className="h-2.5 w-2.5" />
                                            Replied
                                        </span>
                                    )}

                                    {comment.is_hidden && (
                                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '1px solid rgba(251,146,60,0.2)' }}>
                                            <EyeOff className="h-2.5 w-2.5" />
                                            Hidden
                                        </span>
                                    )}
                                </div>

                                {/* Message */}
                                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                    {comment.message}
                                </p>

                                {/* Replies */}
                                {comment.replies && comment.replies.length > 0 && (
                                    <div
                                        className="mt-3 pl-3 space-y-2"
                                        style={{ borderLeft: '2px solid rgba(139,92,246,0.15)' }}
                                    >
                                        {comment.replies.map((reply) => (
                                            <div key={reply.id} className="flex gap-2">
                                                <Avatar className="h-6 w-6 shrink-0">
                                                    <AvatarImage src={reply.author_profile_picture || undefined} />
                                                    <AvatarFallback style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', fontSize: '9px' }}>
                                                        {(reply.author_username || 'U')[0].toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.65)' }}>
                                                            {reply.author_username || 'Unknown'}
                                                        </span>
                                                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.22)' }} suppressHydrationWarning>
                                                            {formatDistanceToNow(new Date(reply.platform_created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                {!comment.is_hidden && (
                                    <div className="flex items-center gap-1 mt-3">
                                        <button
                                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                            style={{ color: 'rgba(255,255,255,0.4)' }}
                                            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                        >
                                            <Reply className="h-3 w-3" />
                                            Reply
                                        </button>
                                        <button
                                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                            style={{ color: 'rgba(167,139,250,0.75)' }}
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
                                            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                            style={{ color: 'rgba(248,113,113,0.6)' }}
                                            onClick={() => onHide(comment.id)}
                                        >
                                            <EyeOff className="h-3 w-3" />
                                            Hide
                                        </button>
                                    </div>
                                )}

                                {/* Reply input */}
                                {replyingTo === comment.id && (
                                    <div className="mt-3 space-y-2">
                                        <textarea
                                            placeholder="Write a reply…"
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            rows={3}
                                            className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none transition-all duration-150"
                                            style={{
                                                background: '#12111e',
                                                border: '1px solid rgba(139,92,246,0.25)',
                                                color: 'rgba(255,255,255,0.8)',
                                            }}
                                            onFocus={(e) => { e.target.style.border = '1px solid rgba(139,92,246,0.5)' }}
                                            onBlur={(e) => { e.target.style.border = '1px solid rgba(139,92,246,0.25)' }}
                                        />
                                        <div className="flex items-center gap-2 justify-end">
                                            <button
                                                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
                                                style={{ color: 'rgba(255,255,255,0.35)' }}
                                                onClick={() => { setReplyingTo(null); setReplyText("") }}
                                            >
                                                <X className="h-3.5 w-3.5" />
                                                Cancel
                                            </button>
                                            <button
                                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50"
                                                style={{
                                                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                                    color: '#fff',
                                                    boxShadow: '0 2px 12px rgba(139,92,246,0.3)',
                                                }}
                                                onClick={() => handleSubmitReply(comment.id)}
                                                disabled={!replyText.trim() || isSubmitting}
                                            >
                                                <Send className="h-3.5 w-3.5" />
                                                {isSubmitting ? "Sending…" : "Send Reply"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-4">
                    <button
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                        style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                        onClick={() => onPageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                    >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Previous
                    </button>
                    <span className="text-xs px-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 disabled:opacity-40"
                        style={{ background: '#12111e', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                        onClick={() => onPageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                    >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </div>
    )
}
