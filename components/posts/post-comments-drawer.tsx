"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet"
import {
    Send,
    Sparkles,
    Eye,
    EyeOff,
    Loader2,
    MessageCircle,
    ExternalLink,
    CornerDownRight,
    User,
    Pencil,
    Trash2,
    X,
    Check
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { useToast } from "@/components/ui/use-toast"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"

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
    source?: 'app_managed' | 'native_discovered'
}

interface CommentData {
    id: string
    platform_comment_id: string
    author_username: string
    message: string
    timestamp: string
    is_hidden?: boolean
    replies: CommentData[]
}

interface GeneratedReplyResponse {
    reply?: string
    error?: string
}

interface CommentsResponseData {
    comments?: CommentData[]
}

interface PostCommentsDrawerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    post: PostData | null
    platform: string
    workspaceId: string
    onPostUpdated?: (post: PostData) => void
    onPostDeleted?: (postId: string) => void
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) {
        const err = new Error(data.error || 'Failed to fetch') as Error & {
            errorCode?: string
            missingPermissions?: string[]
            requiresReconnect?: boolean
        }
        err.errorCode = data.errorCode
        err.missingPermissions = data.missingPermissions
        err.requiresReconnect = data.requiresReconnect
        throw err
    }
    return data
}

const COMMENTS_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.05)',
    cyan: '#38bdf8',
    coral: '#fb7185',
    amber: '#fbbf24',
}

export function PostCommentsDrawer({
    open,
    onOpenChange,
    post,
    platform,
    workspaceId,
    onPostUpdated,
    onPostDeleted,
}: PostCommentsDrawerProps) {
    const [replyingTo, setReplyingTo] = useState<string | null>(null)
    const [replyText, setReplyText] = useState("")
    const [sendingReply, setSendingReply] = useState(false)
    const [generatingAI, setGeneratingAI] = useState<string | null>(null)
    const [hidingComment, setHidingComment] = useState<string | null>(null)
    const [isEditingPost, setIsEditingPost] = useState(false)
    const [editPostText, setEditPostText] = useState("")
    const [savingPostEdit, setSavingPostEdit] = useState(false)
    const [deletingPost, setDeletingPost] = useState(false)
    const [showHiddenComments, setShowHiddenComments] = useState(false)
    const [actionsBlocked, setActionsBlocked] = useState<{
        errorCode: string
        message: string
        missingPermissions: string[]
        requiresReconnect: boolean
    } | null>(null)
    const { toast } = useToast()
    const canWriteContent = useWorkspacePermission("content:write")

    const { data, error, isLoading, mutate } = useSWR(
        open && post ? `/api/posts-media/comments?postId=${post.id}&platform=${platform}` : null,
        fetcher,
        { revalidateOnFocus: false }
    )

    const comments: CommentData[] = data?.comments || []
    const visibleComments = comments.filter((comment) => showHiddenComments || !comment.is_hidden)
    const hiddenCommentsCount = comments.filter((comment) => !!comment.is_hidden).length
    const commentsError = error as (Error & {
        errorCode?: string
        missingPermissions?: string[]
        requiresReconnect?: boolean
    }) | undefined
    const commentsErrorCode = commentsError?.errorCode
    const commentsMissingPermissions = commentsError?.missingPermissions || []
    const commentsRequiresReconnect = !!commentsError?.requiresReconnect
    const commentsReadBlocked = commentsErrorCode === 'meta_missing_permission' || commentsErrorCode === 'meta_auth_invalid_token'
    const commentActionsBlocked = !!actionsBlocked
    const roleActionsBlocked = !canWriteContent
    const canManageFacebookPost = platform === 'facebook' && !!post

    useEffect(() => {
        if (!open) {
            setActionsBlocked(null)
            setReplyingTo(null)
            setReplyText("")
            setShowHiddenComments(false)
            setIsEditingPost(false)
            setEditPostText("")
        }
    }, [open, post?.id, platform])

    useEffect(() => {
        if (post) {
            setEditPostText(post.caption || "")
            setIsEditingPost(false)
        }
    }, [post?.id, post])

    const handleAIReply = async (comment: CommentData) => {
        if (!canWriteContent) {
            toast({
                title: "Read-only role",
                description: "Your role can view comments but cannot reply or moderate comments.",
                variant: "destructive",
            })
            return
        }
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
                        postContent: post?.caption || null,
                        platform,
                        workspaceId,
                    },
                }),
            })

            const result = await response.json()
            if (!response.ok) throw new Error(result?.error || 'Failed to generate AI reply')
            const aiData = result?.data as GeneratedReplyResponse | undefined
            if (aiData?.error) throw new Error(aiData.error)
            if (!aiData?.reply) throw new Error('AI returned an empty reply')
            setReplyText(aiData.reply)
        } catch (err) {
            console.error('AI reply generation failed:', err)
            toast({
                title: "AI reply failed",
                description: err instanceof Error ? err.message : "Could not generate an AI reply. Please try again.",
                variant: "destructive",
            })
        } finally {
            setGeneratingAI(null)
        }
    }

    const handleSendReply = async (commentId: string) => {
        if (!replyText.trim()) return
        if (!canWriteContent) return
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
                if (err?.errorCode === 'meta_missing_permission' || err?.errorCode === 'meta_auth_invalid_token') {
                    setActionsBlocked({
                        errorCode: err.errorCode,
                        message: err.error || 'Comment actions are unavailable for this account.',
                        missingPermissions: Array.isArray(err.missingPermissions) ? err.missingPermissions : [],
                        requiresReconnect: !!err.requiresReconnect,
                    })
                }
                throw new Error(err.error || 'Failed to send reply')
            }

            toast({ title: "Reply sent", description: "Your reply has been posted successfully." })
            setReplyingTo(null)
            setReplyText("")
            mutate()
        } catch (err: unknown) {
            console.error('Reply error:', err)
            toast({
                title: "Reply failed",
                description: err instanceof Error ? err.message : "Failed to send reply.",
                variant: "destructive",
            })
        } finally {
            setSendingReply(false)
        }
    }

    const updateCommentHiddenInCache = (list: CommentData[], commentId: string, hidden: boolean): CommentData[] => {
        return list.map((comment) => {
            if (comment.platform_comment_id === commentId) {
                return { ...comment, is_hidden: hidden }
            }
            if (Array.isArray(comment.replies) && comment.replies.length > 0) {
                return {
                    ...comment,
                    replies: updateCommentHiddenInCache(comment.replies, commentId, hidden),
                }
            }
            return comment
        })
    }

    const handleSetCommentHidden = async (commentId: string, hidden: boolean) => {
        if (!canWriteContent) return
        setHidingComment(commentId)
        try {
            const response = await fetch('/api/posts-media/comments', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commentId,
                    platform,
                    hidden,
                }),
            })

            if (!response.ok) {
                const err = await response.json()
                if (err?.errorCode === 'meta_missing_permission' || err?.errorCode === 'meta_auth_invalid_token') {
                    setActionsBlocked({
                        errorCode: err.errorCode,
                        message: err.error || 'Comment actions are unavailable for this account.',
                        missingPermissions: Array.isArray(err.missingPermissions) ? err.missingPermissions : [],
                        requiresReconnect: !!err.requiresReconnect,
                    })
                }
                throw new Error(err.error || `Failed to ${hidden ? 'hide' : 'unhide'} comment`)
            }

            toast({
                title: hidden ? "Comment hidden" : "Comment unhidden",
                description: hidden ? "The comment has been hidden." : "The comment is visible again.",
            })
            mutate((current?: CommentsResponseData) => {
                if (!current || !Array.isArray(current.comments)) return current
                return {
                    ...current,
                    comments: updateCommentHiddenInCache(current.comments, commentId, hidden),
                }
            }, { revalidate: false })
        } catch (err: unknown) {
            console.error('Comment moderation error:', err)
            toast({
                title: hidden ? "Hide failed" : "Unhide failed",
                description: err instanceof Error ? err.message : `Failed to ${hidden ? 'hide' : 'unhide'} comment.`,
                variant: "destructive",
            })
        } finally {
            setHidingComment(null)
        }
    }

    const handleSavePostEdit = async () => {
        if (!post || !canWriteContent || platform !== 'facebook') return
        const nextCaption = editPostText.trim()
        if (!nextCaption) {
            toast({
                title: "Caption required",
                description: "Facebook post text cannot be empty.",
                variant: "destructive",
            })
            return
        }

        setSavingPostEdit(true)
        try {
            const response = await fetch('/api/posts-media', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postId: post.id,
                    platform: 'facebook',
                    message: nextCaption,
                }),
            })
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to update Facebook post')
            }

            const updatedPost = { ...post, caption: nextCaption }
            onPostUpdated?.(updatedPost)
            setIsEditingPost(false)
            toast({
                title: "Facebook post updated",
                description: "The Page post text was updated successfully.",
            })
        } catch (err: unknown) {
            console.error('Post update error:', err)
            toast({
                title: "Update failed",
                description: err instanceof Error ? err.message : "Failed to update Facebook post.",
                variant: "destructive",
            })
        } finally {
            setSavingPostEdit(false)
        }
    }

    const handleDeletePost = async () => {
        if (!post || !canWriteContent || platform !== 'facebook') return
        const confirmed = window.confirm('Delete this Facebook Page post? This removes it from Facebook and cannot be undone.')
        if (!confirmed) return

        setDeletingPost(true)
        try {
            const response = await fetch(`/api/posts-media?platform=facebook&postId=${encodeURIComponent(post.id)}`, {
                method: 'DELETE',
            })
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to delete Facebook post')
            }

            onPostDeleted?.(post.id)
            onOpenChange(false)
            toast({
                title: "Facebook post deleted",
                description: "The Page post was removed successfully.",
            })
        } catch (err: unknown) {
            console.error('Post delete error:', err)
            toast({
                title: "Delete failed",
                description: err instanceof Error ? err.message : "Failed to delete Facebook post.",
                variant: "destructive",
            })
        } finally {
            setDeletingPost(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-lg p-0 flex flex-col border-0"
                style={{
                    background: '#11131c',
                    borderLeft: `1px solid ${COMMENTS_THEME.border}`,
                }}
            >
                {/* Header */}
                <SheetHeader
                    className="px-5 py-4 flex-none space-y-3"
                    style={{ borderBottom: `1px solid ${COMMENTS_THEME.borderSoft}` }}
                >
                    <div className="flex items-center justify-between gap-3">
                        <SheetTitle className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                            Comments
                        </SheetTitle>
                        <div className="mr-8 flex items-center gap-2">
                            {post?.permalink && (
                                <a
                                    href={post.permalink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-xs transition-colors"
                                    style={{ color: 'rgba(255,255,255,0.4)' }}
                                >
                                    View on {platform === 'instagram' ? 'Instagram' : 'Facebook'}
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            )}
                        </div>
                    </div>

                    {/* Mini post preview */}
                    {post && (
                        <div className="space-y-3">
                            <div className="flex gap-3 items-start">
                                {post.media_url && (
                                    <img
                                        src={post.thumbnail_url || post.media_url}
                                        alt=""
                                        className="h-14 w-14 rounded-lg object-cover flex-none"
                                        style={{ border: `1px solid ${COMMENTS_THEME.border}` }}
                                    />
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.42)' }}>
                                        {post.caption || 'No caption'}
                                    </p>
                                    {canManageFacebookPost && (
                                        <p className="mt-1 text-[10px] uppercase tracking-[0.18em]" style={{ color: 'rgba(56,189,248,0.55)' }}>
                                            {post.source === 'app_managed' ? 'App-managed Page post' : 'Native Page post'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {canManageFacebookPost && (
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditPostText(post.caption || "")
                                            setIsEditingPost((prev) => !prev)
                                        }}
                                        disabled={roleActionsBlocked || deletingPost}
                                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                                        style={{
                                            background: 'rgba(56,189,248,0.10)',
                                            border: '1px solid rgba(56,189,248,0.18)',
                                            color: '#dff6ff',
                                        }}
                                    >
                                        <Pencil className="h-3 w-3" />
                                        Edit Post
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeletePost}
                                        disabled={roleActionsBlocked || deletingPost || savingPostEdit}
                                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                                        style={{
                                            background: 'rgba(248,113,113,0.10)',
                                            border: '1px solid rgba(248,113,113,0.18)',
                                            color: '#fecdd3',
                                        }}
                                    >
                                        {deletingPost ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        Delete
                                    </button>
                                </div>
                            )}

                            {isEditingPost && (
                                <div className="space-y-2 rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.025)', border: `1px solid ${COMMENTS_THEME.borderSoft}` }}>
                                    <textarea
                                        value={editPostText}
                                        onChange={(event) => setEditPostText(event.target.value)}
                                        rows={5}
                                        disabled={savingPostEdit}
                                        className="w-full resize-none rounded-lg px-3 py-2 text-sm outline-none"
                                        style={{
                                            background: COMMENTS_THEME.panelAlt,
                                            border: `1px solid ${COMMENTS_THEME.border}`,
                                            color: 'rgba(255,255,255,0.82)',
                                        }}
                                    />
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleSavePostEdit}
                                            disabled={savingPostEdit || roleActionsBlocked || !editPostText.trim()}
                                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                                            style={{
                                                background: 'linear-gradient(135deg, #38bdf8, #22c55e)',
                                                color: '#06131b',
                                            }}
                                        >
                                            {savingPostEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingPost(false)
                                                setEditPostText(post.caption || "")
                                            }}
                                            disabled={savingPostEdit}
                                            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                                            style={{ color: 'rgba(255,255,255,0.42)' }}
                                        >
                                            <X className="h-3 w-3" />
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </SheetHeader>

                {/* Comments list */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {!isLoading && !error && comments.length > 0 && (
                        <div className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${COMMENTS_THEME.borderSoft}` }}>
                            <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {hiddenCommentsCount > 0
                                    ? `${hiddenCommentsCount} hidden comment${hiddenCommentsCount === 1 ? '' : 's'}`
                                    : 'No hidden comments'}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHiddenComments((prev) => !prev)}
                                disabled={hiddenCommentsCount === 0}
                                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50"
                                style={{
                                    color: showHiddenComments ? '#dff6ff' : 'rgba(255,255,255,0.45)',
                                    background: showHiddenComments ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.02)',
                                    border: `1px solid ${COMMENTS_THEME.borderSoft}`,
                                }}
                            >
                                {showHiddenComments ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                                {showHiddenComments ? 'Hide Hidden' : 'Show Hidden'}
                            </button>
                        </div>
                    )}

                    {isLoading && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-6 w-6 animate-spin" style={{ color: COMMENTS_THEME.cyan }} />
                        </div>
                    )}

                    {commentsReadBlocked && (
                        <div
                            className="rounded-xl p-4"
                            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)' }}
                        >
                            <p className="text-sm font-medium" style={{ color: '#7dd3fc' }}>
                                {platform === 'instagram' ? 'Instagram comment access unavailable' : 'Facebook comment access unavailable'}
                            </p>
                            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {commentsError?.message || 'Meta permissions are missing or the token is invalid.'}
                            </p>
                            {!!commentsMissingPermissions.length && (
                                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                    Missing permissions: <span style={{ color: 'rgba(255,255,255,0.72)' }}>{commentsMissingPermissions.join(', ')}</span>
                                </p>
                            )}
                            {commentsRequiresReconnect && (
                                <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                    Reconnect the account in Settings, then try again.
                                </p>
                            )}
                        </div>
                    )}

                    {error && !commentsReadBlocked && (
                        <div
                            className="rounded-xl p-4 text-center"
                            style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                        >
                            <p className="text-sm" style={{ color: '#f87171' }}>Failed to load comments</p>
                            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{error.message}</p>
                        </div>
                    )}

                    {!isLoading && !error && visibleComments.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <MessageCircle className="h-9 w-9 mb-3" style={{ color: 'rgba(255,255,255,0.1)' }} />
                            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                {comments.length > 0 ? 'No visible comments (hidden comments are filtered)' : 'No comments yet'}
                            </p>
                        </div>
                    )}

                    {actionsBlocked && comments.length > 0 && (
                        <div
                            className="rounded-xl p-3"
                            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.16)' }}
                        >
                            <p className="text-xs font-semibold" style={{ color: COMMENTS_THEME.amber }}>
                                Comment actions unavailable
                            </p>
                            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.42)' }}>
                                {actionsBlocked.message}
                            </p>
                            {!!actionsBlocked.missingPermissions.length && (
                                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                    Missing permissions: {actionsBlocked.missingPermissions.join(', ')}
                                </p>
                            )}
                        </div>
                    )}
                    {roleActionsBlocked && comments.length > 0 && (
                        <div
                            className="rounded-xl p-3"
                            style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.16)' }}
                        >
                            <p className="text-xs font-semibold" style={{ color: COMMENTS_THEME.amber }}>
                                Read-only role
                            </p>
                            <p className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.42)' }}>
                                You can view comments, but replying and hide/unhide actions are disabled for viewers.
                            </p>
                        </div>
                    )}

                    {visibleComments.map((comment) => (
                        <div key={comment.id} className="space-y-2">
                            {/* Main comment */}
                            <div
                                className="rounded-xl p-3 transition-all duration-150"
                                style={{
                                    background: COMMENTS_THEME.panel,
                                    border: `1px solid ${COMMENTS_THEME.border}`,
                                }}
                            >
                                <div className="flex items-start gap-2.5">
                                    <div
                                        className="flex-none w-7 h-7 rounded-full flex items-center justify-center"
                                        style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.16)' }}
                                    >
                                        <User className="h-3.5 w-3.5" style={{ color: '#7dd3fc' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                                @{comment.author_username}
                                            </span>
                                            {comment.is_hidden && (
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                                                    style={{ background: 'rgba(248,113,113,0.1)', color: 'rgba(248,113,113,0.85)', border: '1px solid rgba(248,113,113,0.18)' }}
                                                >
                                                    Hidden
                                                </span>
                                            )}
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
                                        disabled={roleActionsBlocked || commentActionsBlocked || !!comment.is_hidden}
                                    >
                                        <CornerDownRight className="h-3 w-3" />
                                        Reply
                                    </button>
                                    <button
                                        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-all duration-150"
                                        style={{ color: 'rgba(251,191,36,0.85)' }}
                                        onClick={() => handleAIReply(comment)}
                                        disabled={roleActionsBlocked || !!comment.is_hidden || generatingAI === comment.id}
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
                                        style={{ color: comment.is_hidden ? 'rgba(74,222,128,0.75)' : 'rgba(248,113,113,0.6)' }}
                                        onClick={() => handleSetCommentHidden(comment.platform_comment_id, !comment.is_hidden)}
                                        disabled={roleActionsBlocked || commentActionsBlocked || hidingComment === comment.platform_comment_id}
                                    >
                                        {hidingComment === comment.platform_comment_id ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : comment.is_hidden ? (
                                            <Eye className="h-3 w-3" />
                                        ) : (
                                            <EyeOff className="h-3 w-3" />
                                        )}
                                        {comment.is_hidden ? 'Unhide' : 'Hide'}
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
                                            disabled={roleActionsBlocked}
                                            className="w-full rounded-lg px-3 py-2 text-sm resize-none outline-none transition-all duration-150"
                                            style={{
                                                background: COMMENTS_THEME.panelAlt,
                                                border: `1px solid ${COMMENTS_THEME.border}`,
                                                color: 'rgba(255,255,255,0.8)',
                                            }}
                                            onFocus={(e) => { e.target.style.border = '1px solid rgba(56,189,248,0.3)' }}
                                            onBlur={(e) => { e.target.style.border = `1px solid ${COMMENTS_THEME.border}` }}
                                        />
                                        <div className="flex items-center gap-2">
                                            <button
                                                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 disabled:opacity-50"
                                                style={{
                                                    background: 'linear-gradient(135deg, #38bdf8, #fb7185)',
                                                    color: '#fff',
                                                    boxShadow: '0 2px 12px rgba(56,189,248,0.2)',
                                                }}
                                                onClick={() => handleSendReply(comment.platform_comment_id)}
                                                disabled={roleActionsBlocked || commentActionsBlocked || sendingReply || !replyText.trim()}
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
                            {comment.replies && comment.replies.filter((reply) => showHiddenComments || !reply.is_hidden).length > 0 && (
                                <div
                                    className="ml-6 space-y-2 pl-3"
                                    style={{ borderLeft: '2px solid rgba(56,189,248,0.15)' }}
                                >
                                    {comment.replies
                                        .filter((reply) => showHiddenComments || !reply.is_hidden)
                                        .map((reply) => (
                                        <div
                                            key={reply.id}
                                            className="rounded-lg p-2.5"
                                            style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${COMMENTS_THEME.borderSoft}` }}
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
                                                        {reply.is_hidden && (
                                                            <span className="text-[10px]" style={{ color: 'rgba(248,113,113,0.65)' }}>
                                                                Hidden
                                                            </span>
                                                        )}
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
