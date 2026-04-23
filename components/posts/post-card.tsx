"use client"

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
        source?: 'app_managed' | 'native_discovered'
    }
    onClick: () => void
}

export function PostCard({ post, onClick }: PostCardProps) {
    const mediaTypeIcon = () => {
        switch (post.media_type) {
            case 'VIDEO':
                return <Play className="h-3.5 w-3.5" />
            case 'CAROUSEL_ALBUM':
                return <LayoutGrid className="h-3.5 w-3.5" />
            default:
                return null
        }
    }

    return (
        <button
            onClick={onClick}
            className="group relative overflow-hidden rounded-xl text-left w-full focus:outline-none transition-all duration-200 hover:-translate-y-0.5"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 8px 20px rgba(0,0,0,0.16)',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.border = '1px solid rgba(56,189,248,0.2)'
                e.currentTarget.style.boxShadow = '0 12px 28px rgba(56,189,248,0.08)'
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.border = '1px solid rgba(255,255,255,0.08)'
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0,0,0,0.16)'
            }}
        >
            {/* Image */}
            <div className="relative aspect-square overflow-hidden" style={{ background: '#1b1d28' }}>
                {post.media_url ? (
                    <img
                        src={post.thumbnail_url || post.media_url}
                        alt={post.caption?.slice(0, 50) || 'Post'}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-10 w-10" style={{ color: 'rgba(255,255,255,0.1)' }} />
                    </div>
                )}

                {/* Media type badge */}
                {post.media_type !== 'IMAGE' && (
                    <div className="absolute top-2 right-2 rounded-full p-1.5 text-white" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)' }}>
                        {mediaTypeIcon()}
                    </div>
                )}

                {post.source && (
                    <div
                        className="absolute top-2 left-2 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
                        style={{
                            background: post.source === 'native_discovered' ? 'rgba(34,211,238,0.82)' : 'rgba(251,113,133,0.82)',
                            color: '#041018',
                            boxShadow: '0 8px 20px rgba(0,0,0,0.18)',
                        }}
                    >
                        {post.source === 'native_discovered' ? 'Page' : 'App'}
                    </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center gap-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="flex items-center gap-1.5 text-white font-semibold text-sm">
                        <Heart className="h-4 w-4 fill-white" />
                        <span>{formatCount(post.like_count)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-white font-semibold text-sm">
                        <MessageCircle className="h-4 w-4 fill-white" />
                        <span>{formatCount(post.comments_count)}</span>
                    </div>
                </div>
            </div>

            {/* Caption + meta */}
            <div className="p-3 space-y-1.5">
                {post.caption && (
                    <p className="text-xs leading-snug line-clamp-2" style={{ color: 'rgba(255,255,255,0.62)' }}>
                        {post.caption}
                    </p>
                )}
                <div className="flex items-center justify-between">
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.25)' }} suppressHydrationWarning>
                        {formatDistanceToNow(new Date(post.timestamp), { addSuffix: true })}
                    </span>
                    <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                            <Heart className="h-2.5 w-2.5" /> {formatCount(post.like_count)}
                        </span>
                        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                            <MessageCircle className="h-2.5 w-2.5" /> {formatCount(post.comments_count)}
                        </span>
                    </div>
                </div>
                {post.source && (
                    <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                        {post.source === 'native_discovered' ? 'Native Page Content' : 'App-Managed Post'}
                    </div>
                )}
            </div>
        </button>
    )
}

function formatCount(count: number): string {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
    return count.toString()
}
