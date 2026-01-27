"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { createClient } from "@/utils/supabase/client"

function getCookie(name: string): string | undefined {
    if (typeof window === 'undefined') return undefined
    const value = `; ${document.cookie}`
    const parts = value.split(`; ${name}=`)
    if (parts.length === 2) return parts.pop()?.split(';').shift()
}

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
}

export function CommentsList({
    comments,
    pagination,
    onPageChange,
    onReply,
    onHide
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
            const workspaceId = getCookie('active_workspace_id')
            if (!workspaceId) {
                throw new Error('No active workspace')
            }

            const supabase = createClient()
            const { data, error } = await supabase.functions.invoke('generate-reply', {
                body: {
                    comment: comment.message,
                    authorUsername: comment.author_username,
                    postContent: comment.post?.content || null,
                    platform: comment.social_accounts?.platform || 'instagram',
                    workspaceId
                }
            })

            if (error) throw error
            setReplyText(data?.reply || '')
        } catch (error) {
            console.error('AI reply generation failed:', error)
        } finally {
            setGeneratingAI(null)
        }
    }

    const PlatformIcon = ({ platform }: { platform: string }) => {
        if (platform === 'instagram') {
            return <Instagram className="h-3.5 w-3.5" />
        }
        return <Facebook className="h-3.5 w-3.5" />
    }

    const getFirstMediaUrl = (mediaUrls: string[]): string | null => {
        if (!mediaUrls || mediaUrls.length === 0) return null
        const first = mediaUrls[0]
        if (typeof first === 'string') return first
        if (typeof first === 'object' && first !== null) {
            return (first as any).url || (first as any).publicUrl || null
        }
        return null
    }

    return (
        <div className="space-y-4">
            {comments.map((comment) => (
                <Card key={comment.id} className={cn(
                    "transition-opacity",
                    comment.is_hidden && "opacity-50"
                )}>
                    <CardContent className="p-4">
                        {/* Post Preview */}
                        {comment.post && (
                            <div className="mb-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                                <div className="flex gap-3">
                                    {/* Post thumbnail */}
                                    {getFirstMediaUrl(comment.post.media_urls) ? (
                                        <img
                                            src={getFirstMediaUrl(comment.post.media_urls)!}
                                            alt="Post"
                                            className="w-16 h-16 object-cover rounded-md shrink-0"
                                        />
                                    ) : (
                                        <div className="w-16 h-16 bg-muted rounded-md flex items-center justify-center shrink-0">
                                            <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                    )}
                                    {/* Post content preview */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-muted-foreground mb-1">Comment on post:</p>
                                        <p className="text-sm line-clamp-2">
                                            {comment.post.content || 'No caption'}
                                        </p>
                                        {comment.post.permalink && (
                                            <a
                                                href={comment.post.permalink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                                            >
                                                View post <ExternalLink className="h-3 w-3" />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-4">
                            {/* Avatar */}
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={comment.author_profile_picture || undefined} />
                                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white">
                                    {(comment.author_username || 'U')[0].toUpperCase()}
                                </AvatarFallback>
                            </Avatar>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                {/* Header */}
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="font-medium text-sm">
                                        {comment.author_username || 'Unknown User'}
                                    </span>

                                    {comment.social_accounts && (
                                        <Badge variant="secondary" className="gap-1 text-xs">
                                            <PlatformIcon platform={comment.social_accounts.platform} />
                                            {comment.social_accounts.account_name}
                                        </Badge>
                                    )}

                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {formatDistanceToNow(new Date(comment.platform_created_at), { addSuffix: true })}
                                    </span>

                                    {comment.replied_at && (
                                        <Badge variant="outline" className="gap-1 text-xs text-green-600 border-green-600/30">
                                            <CheckCircle className="h-3 w-3" />
                                            Replied
                                        </Badge>
                                    )}

                                    {comment.is_hidden && (
                                        <Badge variant="outline" className="gap-1 text-xs text-orange-600 border-orange-600/30">
                                            <EyeOff className="h-3 w-3" />
                                            Hidden
                                        </Badge>
                                    )}
                                </div>

                                {/* Message */}
                                <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                                    {comment.message}
                                </p>

                                {/* Replies */}
                                {comment.replies && comment.replies.length > 0 && (
                                    <div className="mt-3 pl-4 border-l-2 border-border/50 space-y-3">
                                        {comment.replies.map((reply) => (
                                            <div key={reply.id} className="flex gap-3">
                                                <Avatar className="h-7 w-7 shrink-0">
                                                    <AvatarImage src={reply.author_profile_picture || undefined} />
                                                    <AvatarFallback className="text-xs bg-muted">
                                                        {(reply.author_username || 'U')[0].toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="font-medium text-xs">
                                                            {reply.author_username || 'Unknown'}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground">
                                                            {formatDistanceToNow(new Date(reply.platform_created_at), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-foreground/80">
                                                        {reply.message}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="flex items-center gap-2 mt-3">
                                    {!comment.is_hidden && (
                                        <>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-xs gap-1.5"
                                                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                                            >
                                                <Reply className="h-3.5 w-3.5" />
                                                Reply
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-xs gap-1.5 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                                onClick={() => handleAIReply(comment)}
                                                disabled={generatingAI === comment.id}
                                            >
                                                {generatingAI === comment.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Sparkles className="h-3.5 w-3.5" />
                                                )}
                                                AI Reply
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-orange-600"
                                                onClick={() => onHide(comment.id)}
                                            >
                                                <EyeOff className="h-3.5 w-3.5" />
                                                Hide
                                            </Button>
                                        </>
                                    )}
                                </div>

                                {/* Reply input */}
                                {replyingTo === comment.id && (
                                    <div className="mt-3 space-y-2">
                                        <Textarea
                                            placeholder="Write a reply..."
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            className="min-h-[80px] resize-none"
                                        />
                                        <div className="flex items-center gap-2 justify-end">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setReplyingTo(null)
                                                    setReplyText("")
                                                }}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                Cancel
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleSubmitReply(comment.id)}
                                                disabled={!replyText.trim() || isSubmitting}
                                                className="gap-1.5"
                                            >
                                                <Send className="h-3.5 w-3.5" />
                                                {isSubmitting ? "Sending..." : "Send Reply"}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ))}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                    >
                        <ChevronLeft className="h-4 w-4" />
                        Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                        Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                    >
                        Next
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
    )
}
