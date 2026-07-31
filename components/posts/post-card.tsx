"use client"

import { formatDistanceToNow } from "date-fns"
import {
    ArrowUpRight,
    Heart,
    Image as ImageIcon,
    LayoutGrid,
    MessageCircle,
    Play,
} from "lucide-react"

export interface PostCardData {
    id: string
    media_type: string
    media_url: string
    thumbnail_url: string
    caption: string
    timestamp: string
    permalink: string
    comments_count: number
    like_count: number
    source?: "app_managed" | "native_discovered"
}

interface PostCardProps {
    post: PostCardData
    onClick: () => void
}

export function PostCard({ post, onClick }: PostCardProps) {
    const engagement = post.like_count + post.comments_count
    const mediaLabel = post.media_type === "CAROUSEL_ALBUM"
        ? "Carousel"
        : post.media_type === "VIDEO"
            ? "Video"
            : "Image"

    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={`Open ${mediaLabel.toLowerCase()} post${post.caption ? `: ${post.caption.slice(0, 70)}` : ""}`}
            className="group relative w-full overflow-hidden rounded-[22px] border border-white/[0.075] bg-[#11141e] text-left shadow-[0_18px_45px_rgba(2,4,12,0.18)] transition duration-200 hover:-translate-y-1 hover:border-cyan-200/20 hover:shadow-[0_24px_60px_rgba(34,211,238,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
        >
            <div className="relative aspect-[4/4.35] overflow-hidden bg-[#181b27]">
                {post.media_url ? (
                    // Provider URLs are dynamic and cannot be safely allow-listed for next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={post.thumbnail_url || post.media_url}
                        alt={post.caption?.slice(0, 90) || `${mediaLabel} post`}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035] group-hover:brightness-90"
                    />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.08),transparent_55%)]">
                        <ImageIcon className="h-10 w-10 text-white/10" aria-hidden="true" />
                    </div>
                )}

                <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-[#0a0c14] via-transparent to-black/10" />

                <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/72 backdrop-blur-md">
                        {post.media_type === "VIDEO" ? <Play className="h-3 w-3" aria-hidden="true" /> : null}
                        {post.media_type === "CAROUSEL_ALBUM" ? <LayoutGrid className="h-3 w-3" aria-hidden="true" /> : null}
                        {mediaLabel}
                    </span>
                    {post.source ? (
                        <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/70 backdrop-blur-md">
                            {post.source === "native_discovered" ? "Native" : "Managed"}
                        </span>
                    ) : null}
                </div>

                <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                    <div className="flex gap-2">
                        <Metric icon={Heart} value={post.like_count} label="likes" />
                        <Metric icon={MessageCircle} value={post.comments_count} label="comments" />
                    </div>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white/65 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                </div>
            </div>

            <div className="p-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/28" suppressHydrationWarning>
                        {formatDistanceToNow(new Date(post.timestamp), { addSuffix: true })}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-white/32">
                        {formatCount(engagement)} interactions
                    </span>
                </div>
                <p className="mt-3 min-h-10 line-clamp-2 text-sm leading-5 text-white/62">
                    {post.caption || "No caption added to this post."}
                </p>
            </div>
        </button>
    )
}

function Metric({
    icon: Icon,
    value,
    label,
}: {
    icon: typeof Heart
    value: number
    label: string
}) {
    return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/55 px-2.5 py-1.5 text-xs font-semibold text-white/82 backdrop-blur-md" aria-label={`${value} ${label}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {formatCount(value)}
        </span>
    )
}

function formatCount(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
    return count.toString()
}
