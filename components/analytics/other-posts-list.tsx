"use client"

import { Eye, Heart, MessageCircle, Share2, Trophy } from "lucide-react"
import type { PostData } from "@/types/analytics"

export function OtherPostsList({ posts }: { posts: PostData[] }) {
    return (
        <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#10131c]" aria-labelledby="top-content-title">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/28">Content performance</p>
                    <h2 id="top-content-title" className="mt-1 text-sm font-semibold text-white/84">Top posts in this range</h2>
                </div>
                <span className="rounded-lg border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-white/38">
                    {posts.length} ranked
                </span>
            </div>

            {posts.length === 0 ? (
                <div className="px-6 py-10 text-center">
                    <p className="text-sm font-medium text-white/55">No posts in this date range</p>
                    <p className="mt-1 text-xs text-white/30">Choose a wider range or sync after publishing new content.</p>
                </div>
            ) : (
                <div className="divide-y divide-white/[0.055]">
                    {posts.slice(0, 8).map((post, index) => (
                        <article key={post.id} className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[36px_minmax(0,1fr)_auto] sm:items-center sm:px-6">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.035] text-xs font-semibold tabular-nums text-white/45">
                                {index === 0 ? <Trophy className="h-3.5 w-3.5 text-amber-200" aria-label="Top post" /> : index + 1}
                            </div>
                            <div className="min-w-0">
                                <p className="line-clamp-1 text-sm font-medium text-white/68">{post.caption}</p>
                                <p className="mt-1 text-[11px] text-white/28">{post.timeAgo}</p>
                            </div>
                            <div className="grid grid-cols-4 gap-3 sm:min-w-[280px]">
                                <Metric icon={Heart} value={post.likes} className="text-pink-200" label="Likes" />
                                <Metric icon={MessageCircle} value={post.comments} className="text-cyan-200" label="Comments" />
                                <Metric icon={Share2} value={post.shares} className="text-lime-200" label="Shares" />
                                <Metric icon={Eye} value={post.views} className="text-amber-200" label="Views" />
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </section>
    )
}

function Metric({ icon: Icon, value, className, label }: { icon: typeof Heart; value: number; className: string; label: string }) {
    return (
        <div className="text-right" title={`${label}: ${value.toLocaleString()}`}>
            <div className="flex items-center justify-end gap-1.5">
                <Icon className={`h-3.5 w-3.5 ${className}`} aria-hidden="true" />
                <span className="text-xs font-semibold tabular-nums text-white/65">{value.toLocaleString()}</span>
            </div>
            <p className="mt-1 hidden text-[8px] font-semibold uppercase tracking-[0.1em] text-white/22 sm:block">{label}</p>
        </div>
    )
}
