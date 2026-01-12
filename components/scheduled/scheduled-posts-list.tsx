"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { Pencil, CalendarDays, FileText, Trash2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import { createClient } from "@/utils/supabase/client"

interface ScheduledPostsListProps {
    posts: any[]
    workspaceId: string
    status?: 'scheduled' | 'draft' | 'posted' | 'failed'
}

export function ScheduledPostsList({ posts, workspaceId, status = 'scheduled' }: ScheduledPostsListProps) {
    const [editingPost, setEditingPost] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [deletePostId, setDeletePostId] = useState<string | null>(null)
    const [isDeleting, setIsDeleting] = useState(false)
    const { toast } = useToast()
    const router = useRouter()
    const supabase = createClient()

    const handleEdit = (post: any) => {
        setEditingPost(post)
        setIsModalOpen(true)
    }

    const handleModalClose = (open: boolean) => {
        setIsModalOpen(open)
        if (!open) setEditingPost(null)
    }

    const handleDeleteClick = (postId: string) => {
        setDeletePostId(postId)
    }

    const handleDeleteConfirm = async () => {
        if (!deletePostId) return

        setIsDeleting(true)
        try {
            const { error } = await supabase
                .from('posts')
                .delete()
                .eq('id', deletePostId)

            if (error) throw error

            toast({
                title: "Post deleted",
                description: "The post has been permanently deleted.",
            })

            // Refresh the page to update the lists
            router.refresh()
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "Failed to delete post",
                variant: "destructive",
            })
        } finally {
            setIsDeleting(false)
            setDeletePostId(null)
        }
    }

    if (!posts || posts.length === 0) {
        const emptyStates = {
            draft: {
                icon: <FileText className="h-8 w-8 text-primary" />,
                title: "No drafts saved",
                description: "You don't have any draft posts. Create a new post and save it as a draft to work on it later!"
            },
            scheduled: {
                icon: <CalendarDays className="h-8 w-8 text-primary" />,
                title: "No posts scheduled",
                description: "You don't have any posts scheduled for the future. Create a new post to get started!"
            },
            posted: {
                icon: <CalendarDays className="h-8 w-8 text-primary" />,
                title: "No posted content",
                description: "You haven't published any posts yet. Once your scheduled posts go live, they'll appear here!"
            },
            failed: {
                icon: <CalendarDays className="h-8 w-8 text-destructive" />,
                title: "No failed posts",
                description: "Great news! You don't have any failed posts. All your publishing attempts have been successful!"
            }
        }

        const currentState = emptyStates[status]

        return (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                <div className="p-4 bg-primary/10 rounded-full mb-4">
                    {currentState.icon}
                </div>
                <h3 className="text-lg font-semibold">
                    {currentState.title}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    {currentState.description}
                </p>
            </Card>
        )
    }

    return (
        <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {posts.map((post) => (
                    <Card key={post.id} className="overflow-hidden group relative">
                        {post.media_urls && post.media_urls.length > 0 && (
                            <div className="aspect-video w-full bg-muted/20 relative">
                                <img
                                    src={post.media_urls[0]}
                                    alt="Post media"
                                    className="w-full h-full object-cover"
                                />
                            </div>
                        )}
                        <CardContent className="pt-6">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex flex-col gap-1">
                                    {post.scheduled_for && (
                                        <>
                                            <Badge variant="secondary" className="w-fit">
                                                {new Date(post.scheduled_for).toLocaleDateString()}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </>
                                    )}
                                    {post.published_at && (
                                        <Badge variant="default" className="w-fit">
                                            Published {new Date(post.published_at).toLocaleDateString()}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Badge
                                        variant={
                                            post.status === 'posted' ? 'default' :
                                                post.status === 'failed' ? 'destructive' :
                                                    'outline'
                                        }
                                        className="capitalize"
                                    >
                                        {post.status}
                                    </Badge>
                                </div>
                            </div>
                            <p className="line-clamp-3 text-sm mb-4">{post.content}</p>
                            <div className="flex flex-wrap gap-1">
                                {(() => {
                                    const platforms = Array.isArray(post.platforms)
                                        ? post.platforms
                                        : post.platforms?.selection || []

                                    return platforms.length > 0
                                        ? platforms.map((p: string) => (
                                            <Badge key={p} variant="outline" className="capitalize text-[10px] px-2 py-0 h-5">
                                                {p}
                                            </Badge>
                                        ))
                                        : <span className="text-xs text-muted-foreground">No platforms</span>
                                })()}
                            </div>

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                <Button
                                    size="icon"
                                    variant="secondary"
                                    className="h-8 w-8 shadow-sm"
                                    onClick={() => handleEdit(post)}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    size="icon"
                                    variant="destructive"
                                    className="h-8 w-8 shadow-sm"
                                    onClick={() => handleDeleteClick(post.id)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <CreatePostModal
                open={isModalOpen}
                onOpenChange={handleModalClose}
                postToEdit={editingPost}
                workspaceId={workspaceId}
            />

            <AlertDialog open={!!deletePostId} onOpenChange={(open) => !open && setDeletePostId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Post</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this post? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
