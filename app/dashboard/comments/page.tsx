"use client"

import { useState } from "react"
import useSWR from "swr"
import { CommentsHeader } from "@/components/comments/comments-header"
import { CommentsList } from "@/components/comments/comments-list"
import { CommentsLoadingSkeleton } from "@/components/comments/comments-loading"
import { useToast } from "@/components/ui/use-toast"

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

interface CommentsResponse {
    comments: Comment[]
    pagination: {
        page: number
        limit: number
        total: number
        totalPages: number
    }
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch')
    return data
}

export default function CommentsPage() {
    const [page, setPage] = useState(1)
    const [isSyncing, setIsSyncing] = useState(false)
    const { toast } = useToast()

    // Fetch comments
    const { data, error, isLoading, mutate } = useSWR<CommentsResponse>(
        `/api/comments?page=${page}&limit=20`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const response = await fetch('/api/sync-comments', {
                method: 'POST'
            })

            if (!response.ok) {
                throw new Error('Failed to sync comments')
            }

            const result = await response.json()

            toast({
                title: "Comments synced",
                description: `Successfully synced ${result.synced || 0} comments`,
            })

            // Refresh comments
            mutate()
        } catch (error) {
            console.error('Sync error:', error)
            toast({
                title: "Sync failed",
                description: "Failed to sync comments. Please try again.",
                variant: "destructive",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const handleReply = async (commentId: string, message: string) => {
        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commentId, message })
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to reply')
            }

            toast({
                title: "Reply sent",
                description: "Your reply has been posted successfully.",
            })

            mutate()
        } catch (error: any) {
            console.error('Reply error:', error)
            toast({
                title: "Reply failed",
                description: error.message || "Failed to send reply. Please try again.",
                variant: "destructive",
            })
        }
    }

    const handleHide = async (commentId: string) => {
        try {
            const response = await fetch(`/api/comments?commentId=${commentId}`, {
                method: 'DELETE'
            })

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to hide comment')
            }

            toast({
                title: "Comment hidden",
                description: "The comment has been hidden.",
            })

            mutate()
        } catch (error: any) {
            console.error('Hide error:', error)
            toast({
                title: "Hide failed",
                description: error.message || "Failed to hide comment. Please try again.",
                variant: "destructive",
            })
        }
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <CommentsHeader
                onSync={handleSync}
                isSyncing={isSyncing}
                totalComments={data?.pagination?.total || 0}
            />

            {/* Loading state */}
            {isLoading && <CommentsLoadingSkeleton />}

            {/* Error state */}
            {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
                    <p className="text-destructive font-medium">Failed to load comments</p>
                    <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
                </div>
            )}

            {/* Comments list */}
            {data?.comments && data.comments.length > 0 && !isLoading && (
                <CommentsList
                    comments={data.comments}
                    pagination={data.pagination}
                    onPageChange={setPage}
                    onReply={handleReply}
                    onHide={handleHide}
                />
            )}

            {/* Empty state */}
            {data?.comments && data.comments.length === 0 && !isLoading && (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-12 text-center">
                    <p className="text-muted-foreground font-medium">No comments yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
                        Sync your accounts to start seeing comments from your posts.
                    </p>
                </div>
            )}
        </div>
    )
}
