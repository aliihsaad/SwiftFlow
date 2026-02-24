"use client"

import { PostData } from "@/types/analytics"
import { Heart, MessageCircle, Share2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface OtherPostsListProps {
    posts: PostData[]
}

export function OtherPostsList({ posts }: OtherPostsListProps) {
    if (posts.length === 0) {
        return (
            <div
                className="rounded-xl p-5"
                style={{
                    background: '#151620',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>Other Posts</h3>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No other posts available</p>
            </div>
        )
    }

    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            {/* Header */}
            <div
                className="px-5 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Other Posts</h3>
            </div>

            {/* List */}
            <div className="p-5">
                <ScrollArea className="h-[520px] pr-2">
                    <div className="space-y-0">
                        {posts.map((post, index) => {
                            const isInstagram = post.platform === 'instagram'
                            return (
                                <div
                                    key={post.id}
                                    className="py-4 space-y-2.5"
                                    style={
                                        index < posts.length - 1
                                            ? { borderBottom: '1px solid rgba(255,255,255,0.05)' }
                                            : undefined
                                    }
                                >
                                    {/* Time + platform */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{post.timeAgo}</span>
                                        <span
                                            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                                            style={
                                                isInstagram
                                                    ? { background: 'rgba(251,113,133,0.10)', color: '#fda4af', border: '1px solid rgba(251,113,133,0.2)' }
                                                    : { background: 'rgba(34,211,238,0.10)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.2)' }
                                            }
                                        >
                                            {isInstagram ? 'IG' : 'FB'}
                                        </span>
                                    </div>

                                    {/* Caption */}
                                    <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        {post.caption}
                                    </p>

                                    {/* Metrics */}
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1.5">
                                            <Heart className="h-3 w-3 text-pink-400" />
                                            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>{post.likes.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <MessageCircle className="h-3 w-3" style={{ color: '#22d3ee' }} />
                                            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>{post.comments.toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Share2 className="h-3 w-3" style={{ color: '#84cc16' }} />
                                            <span className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>{post.shares.toLocaleString()}</span>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </div>
        </div>
    )
}
