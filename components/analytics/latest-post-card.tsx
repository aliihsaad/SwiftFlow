"use client"

import { PostData } from "@/types/analytics"
import { Heart, MessageCircle, Share2, Eye } from "lucide-react"

interface LatestPostCardProps {
    post: PostData | null
}

export function LatestPostCard({ post }: LatestPostCardProps) {
    if (!post) {
        return (
            <div
                className="rounded-xl p-5"
                style={{
                    background: '#151620',
                    border: '1px solid rgba(255,255,255,0.08)',
                }}
            >
                <h3 className="text-sm font-semibold mb-3" style={{ color: 'rgba(255,255,255,0.7)' }}>Latest Post</h3>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>No posts available</p>
            </div>
        )
    }

    const isInstagram = post.platform === 'instagram'

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
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Latest Post</h3>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
                {/* Meta */}
                <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{post.timeAgo}</span>
                    <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                        style={
                            isInstagram
                                ? { background: 'rgba(251,113,133,0.12)', color: '#fda4af', border: '1px solid rgba(251,113,133,0.22)' }
                                : { background: 'rgba(34,211,238,0.12)', color: '#67e8f9', border: '1px solid rgba(34,211,238,0.22)' }
                        }
                    >
                        {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                    </span>
                </div>

                {/* Caption */}
                <p className="text-sm leading-relaxed line-clamp-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {post.caption}
                </p>

                {/* Metrics */}
                <div
                    className="flex items-center gap-4 pt-4"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <div className="flex items-center gap-1.5">
                        <Heart className="h-3.5 w-3.5 text-pink-400" />
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{post.likes.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <MessageCircle className="h-3.5 w-3.5" style={{ color: '#22d3ee' }} />
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{post.comments.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Share2 className="h-3.5 w-3.5" style={{ color: '#84cc16' }} />
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{post.shares.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-auto">
                        <Eye className="h-3.5 w-3.5" style={{ color: '#f59e0b' }} />
                        <span className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{post.views.toLocaleString()}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
