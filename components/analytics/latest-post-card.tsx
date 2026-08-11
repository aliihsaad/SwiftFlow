"use client"

import { Eye, Heart, MessageCircle, Share2 } from "lucide-react"
import type { PostData } from "@/types/analytics"

export function LatestPostCard({ post }: { post: PostData | null }) {
    return (
        <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#10131c]" aria-labelledby="latest-post-title">
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/28">Most recent</p>
                    <h2 id="latest-post-title" className="mt-1 text-sm font-semibold text-white/82">Latest post in range</h2>
                </div>
                {post ? <span className="text-[10px] text-white/28">{post.timeAgo}</span> : null}
            </div>

            {post ? (
                <div className="p-5">
                    <p className="line-clamp-3 text-sm leading-6 text-white/55">{post.caption}</p>
                    <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/[0.055] pt-4">
                        <Metric icon={Heart} value={post.likes} label="Likes" className="text-pink-200" />
                        <Metric icon={MessageCircle} value={post.comments} label="Comments" className="text-cyan-200" />
                        <Metric icon={Share2} value={post.shares} label="Shares" className="text-lime-200" />
                        <Metric icon={Eye} value={post.views} label="Views" className="text-amber-200" />
                    </div>
                </div>
            ) : (
                <div className="px-5 py-8 text-center">
                    <p className="text-sm text-white/42">No post in this date range.</p>
                </div>
            )}
        </section>
    )
}

function Metric({ icon: Icon, value, label, className }: { icon: typeof Heart; value: number; label: string; className: string }) {
    return (
        <div title={`${label}: ${value.toLocaleString()}`}>
            <div className="flex items-center gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${className}`} aria-hidden="true" />
                <span className="text-xs font-semibold tabular-nums text-white/68">{value.toLocaleString()}</span>
            </div>
            <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.08em] text-white/22">{label}</p>
        </div>
    )
}
