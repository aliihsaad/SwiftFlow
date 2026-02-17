"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
import { cn } from "@/lib/utils"
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

    // Fetch comments live from Meta API
    const { data, error, isLoading, mutate } = useSWR(
        open && post ? `/api/posts-media/comments?postId=${post.id}&platform=${platform}` : null,
        fetcher,
        { revalidateOnFocus: false }
    )

    const comments: CommentData[] = data?.comments || []

    // AI Reply
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

    // Send Reply
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

            toast({
                title: "Reply sent",
                description: "Your reply has been posted successfully.",
            })

            setReplyingTo(null)
            setReplyText("")
            mutate() // Refresh comments
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

    // Hide Comment
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

            toast({
                title: "Comment hidden",
                description: "The comment has been hidden.",
            })

            mutate() // Refresh
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
                className="w-full sm:max-w-lg p-0 flex flex-col"
            >
                {/* Header with post preview */}
                <SheetHeader className="px-5 py-4 border-b border-border/40 space-y-3 flex-none">
                    <div className="flex items-center justify-between">
                        <SheetTitle className="text-base font-semibold">
                            Comments
                        </SheetTitle>
                        {post?.permalink && (
                            <a
                                href={post.permalink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors mr-8"
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
                                    className="h-14 w-14 rounded-lg object-cover flex-none border border-border/50"
                                />
                            )}
                            <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                                {post.caption || 'No caption'}
                            </p>
                        </div>
                    )}
                </SheetHeader>

                {/* Comments list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}

                    {error && (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
                            <p className="text-sm text-destructive">Failed to load comments</p>
                            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
                        </div>
                    )}

                    {!isLoading && !error && comments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <MessageCircle className="h-10 w-10 text-muted-foreground/30 mb-3" />
                            <p className="text-sm text-muted-foreground">No comments yet</p>
                        </div>
                    )}

                    {comments.map((comment) => (
                        <div key={comment.id} className="space-y-2">
                            {/* Main comment */}
                            <div className="group rounded-lg border border-border/30 bg-muted/20 p-3 transition-colors hover:border-border/60">
                                <div className="flex items-start gap-2.5">
                                    <div className="flex-none w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                                        <User className="h-3.5 w-3.5 text-primary" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-medium text-foreground">
                                                @{comment.author_username}
                                            </span>
                                            <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                                                {formatDistanceToNow(new Date(comment.timestamp), { addSuffix: true })}
                                            </span>
                                        </div>
                                        <p className="text-sm text-foreground/90 leading-relaxed">
                                            {comment.message}
                                        </p>
                                    </div>
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 mt-2 ml-9">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                                        onClick={() => {
                                            setReplyingTo(replyingTo === comment.id ? null : comment.id)
                                            setReplyText("")
                                        }}
                                    >
                                        <CornerDownRight className="h-3 w-3 mr-1" />
                                        Reply
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-purple-500"
                                        onClick={() => handleAIReply(comment)}
                                        disabled={generatingAI === comment.id}
                                    >
                                        {generatingAI === comment.id ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                            <Sparkles className="h-3 w-3 mr-1" />
                                        )}
                                        AI Reply
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                                        onClick={() => handleHide(comment.platform_comment_id)}
                                        disabled={hidingComment === comment.platform_comment_id}
                                    >
                                        {hidingComment === comment.platform_comment_id ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                            <EyeOff className="h-3 w-3 mr-1" />
                                        )}
                                        Hide
                                    </Button>
                                </div>

                                {/* Reply box */}
                                {replyingTo === comment.id && (
                                    <div className="mt-3 ml-9 space-y-2">
                                        <Textarea
                                            value={replyText}
                                            onChange={(e) => setReplyText(e.target.value)}
                                            placeholder="Write a reply..."
                                            className="min-h-[60px] text-sm resize-none bg-background"
                                            autoFocus
                                        />
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                className="h-7 px-3 text-xs"
                                                onClick={() => handleSendReply(comment.platform_comment_id)}
                                                disabled={sendingReply || !replyText.trim()}
                                            >
                                                {sendingReply ? (
                                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                ) : (
                                                    <Send className="h-3 w-3 mr-1" />
                                                )}
                                                Send
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => {
                                                    setReplyingTo(null)
                                                    setReplyText("")
                                                }}
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Nested replies */}
                            {comment.replies && comment.replies.length > 0 && (
                                <div className="ml-6 space-y-2 border-l-2 border-border/30 pl-3">
                                    {comment.replies.map((reply) => (
                                        <div
                                            key={reply.id}
                                            className="rounded-lg bg-muted/10 p-2.5"
                                        >
                                            <div className="flex items-start gap-2">
                                                <div className="flex-none w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                                                    <User className="h-2.5 w-2.5 text-muted-foreground" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-xs font-medium">
                                                            @{reply.author_username}
                                                        </span>
                                                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                                                            {formatDistanceToNow(new Date(reply.timestamp), { addSuffix: true })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-foreground/80">
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
