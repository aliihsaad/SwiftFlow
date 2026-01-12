"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PostData } from "@/types/analytics"
import { Heart, MessageCircle, Share2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface OtherPostsListProps {
    posts: PostData[]
}

export function OtherPostsList({ posts }: OtherPostsListProps) {
    if (posts.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Other Posts</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No other posts available</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Other Posts</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                    <div className="space-y-4">
                        {posts.map((post) => (
                            <div
                                key={post.id}
                                className="pb-4 border-b last:border-0 last:pb-0 space-y-3"
                            >
                                {/* Time ago */}
                                <p className="text-xs text-muted-foreground">{post.timeAgo}</p>

                                {/* Caption */}
                                <p className="text-sm leading-relaxed line-clamp-3">
                                    {post.caption}
                                </p>

                                {/* Metrics */}
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-1.5">
                                        <Heart className="h-3.5 w-3.5 text-pink-500" />
                                        <span className="text-xs font-medium">{post.likes.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <MessageCircle className="h-3.5 w-3.5 text-blue-500" />
                                        <span className="text-xs font-medium">{post.comments.toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Share2 className="h-3.5 w-3.5 text-green-500" />
                                        <span className="text-xs font-medium">{post.shares.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    )
}
