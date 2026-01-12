"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PostData } from "@/types/analytics"
import { Badge } from "@/components/ui/badge"
import { Heart, MessageCircle, Share2, Eye } from "lucide-react"

interface LatestPostCardProps {
    post: PostData | null
}

export function LatestPostCard({ post }: LatestPostCardProps) {
    if (!post) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Latest Post</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">No posts available</p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Latest Post</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Post meta */}
                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{post.timeAgo}</span>
                    <Badge
                        variant="outline"
                        className={
                            post.platform === 'instagram'
                                ? 'border-pink-500 text-pink-600 dark:text-pink-400'
                                : 'border-blue-500 text-blue-600 dark:text-blue-400'
                        }
                    >
                        {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                    </Badge>
                </div>

                {/* Caption */}
                <p className="text-sm leading-relaxed text-foreground/90">
                    {post.caption}
                </p>

                {/* Metrics */}
                <div className="flex items-center gap-4 pt-4 border-t">
                    <div className="flex items-center gap-1.5">
                        <Heart className="h-4 w-4 text-pink-500" />
                        <span className="text-sm font-medium">{post.likes.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">{post.comments.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Share2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">{post.shares.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                        <Eye className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">{post.views.toLocaleString()}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
