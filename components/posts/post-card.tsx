"use client"

import { cn } from "@/lib/utils"
import { Heart, MessageCircle, Play, Image as ImageIcon, LayoutGrid } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface PostCardProps {
    post: {
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
    onClick: () => void
}

export function PostCard({ post, onClick }: PostCardProps) {
    const mediaTypeIcon = () => {
        switch (post.media_type) {
            case 'VIDEO':
                return <Play className="h-4 w-4" />
            case 'CAROUSEL_ALBUM':
                return <LayoutGrid className="h-4 w-4" />
            default:
                return null
        }
    }

    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative overflow-hidden rounded-xl border border-border/50",
                "bg-card transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
                "text-left w-full focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background"
            )}
        >
            {/* Image */}
            <div className="relative aspect-square overflow-hidden bg-muted">
                {post.media_url ? (
                    <img
                        src={post.thumbnail_url || post.media_url}
                        alt={post.caption?.slice(0, 50) || 'Post'}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                )}

                {/* Media type badge */}
                {post.media_type !== 'IMAGE' && (
                    <div className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm">
                        {mediaTypeIcon()}
                    </div>
                )}

                {/* Hover overlay with stats */}
                <div className="absolute inset-0 flex items-center justify-center gap-6 bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="flex items-center gap-1.5 text-white font-semibold">
                        <Heart className="h-5 w-5 fill-white" />
                        <span>{formatCount(post.like_count)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-white font-semibold">
                        <MessageCircle className="h-5 w-5 fill-white" />
                        <span>{formatCount(post.comments_count)}</span>
                    </div>
                </div>
            </div>

            {/* Caption + meta */}
            <div className="p-3 space-y-2">
                {post.caption && (
                    <p className="text-sm text-foreground line-clamp-2 leading-snug">
                        {post.caption}
                    </p>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                        {formatDistanceToNow(new Date(post.timestamp), { addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {formatCount(post.like_count)}
                        </span>
                        <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" /> {formatCount(post.comments_count)}
                        </span>
                    </div>
                </div>
            </div>
        </button>
    )
}

function formatCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
}
