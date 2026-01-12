"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { Pencil, CalendarDays } from "lucide-react"

export function ScheduledPostsList({ posts, workspaceId }: { posts: any[], workspaceId: string }) {
    const [editingPost, setEditingPost] = useState<any>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)

    const handleEdit = (post: any) => {
        setEditingPost(post)
        setIsModalOpen(true)
    }

    const handleModalClose = (open: boolean) => {
        setIsModalOpen(open)
        if (!open) setEditingPost(null)
    }

    if (!posts || posts.length === 0) {
        return (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                <div className="p-4 bg-primary/10 rounded-full mb-4">
                    <CalendarDays className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No posts scheduled</h3>
                <p className="text-muted-foreground mt-2 max-w-sm">
                    You don't have any posts scheduled for the future. Create a new post to get started!
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
                                    <Badge variant="secondary" className="w-fit">
                                        {new Date(post.scheduled_for).toLocaleDateString()}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                <div className="flex gap-2 items-center">
                                    <Badge variant={post.status === 'published' ? 'default' : 'outline'} className="capitalize">
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

                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    size="icon"
                                    variant="secondary"
                                    className="h-8 w-8 shadow-sm"
                                    onClick={() => handleEdit(post)}
                                >
                                    <Pencil className="h-4 w-4" />
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
        </>
    )
}
