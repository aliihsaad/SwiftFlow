"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
    ArrowRight,
    CalendarClock,
    CheckCircle2,
    CircleAlert,
    FileEdit,
    ListFilter,
    Plus,
    Radio,
    Search,
    Sparkles,
} from "lucide-react"

import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import { ScheduledPostsList, type ScheduledPostCard } from "@/components/scheduled/scheduled-posts-list"
import { cn } from "@/lib/utils"

type PostView = "scheduled" | "drafts" | "posted" | "failed"
type ScheduledPostStatus = "scheduled" | "draft" | "published" | "failed"

interface PostsTabViewProps {
    scheduledPosts: ScheduledPostCard[]
    draftPosts: ScheduledPostCard[]
    postedPosts: ScheduledPostCard[]
    failedPosts: ScheduledPostCard[]
    workspaceId: string
    workspaceName: string
    defaultTab?: string
}

const viewMeta: Record<PostView, {
    label: string
    shortLabel: string
    description: string
    status: ScheduledPostStatus
    icon: typeof CalendarClock
    tone: "cyan" | "amber" | "emerald" | "rose"
}> = {
    scheduled: {
        label: "Scheduled queue",
        shortLabel: "Scheduled",
        description: "Approved content waiting for its publishing window.",
        status: "scheduled",
        icon: CalendarClock,
        tone: "cyan",
    },
    drafts: {
        label: "Draft workspace",
        shortLabel: "Drafts",
        description: "Ideas and generated content waiting for a final review.",
        status: "draft",
        icon: FileEdit,
        tone: "amber",
    },
    posted: {
        label: "Published archive",
        shortLabel: "Published",
        description: "Successfully delivered content and its available results.",
        status: "published",
        icon: CheckCircle2,
        tone: "emerald",
    },
    failed: {
        label: "Needs attention",
        shortLabel: "Failed",
        description: "Publishing attempts that need review before retrying.",
        status: "failed",
        icon: CircleAlert,
        tone: "rose",
    },
}

const toneStyles = {
    cyan: {
        icon: "border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-200",
        active: "border-cyan-200/20 bg-cyan-300/[0.085] text-cyan-100",
        glow: "from-cyan-300/15",
    },
    amber: {
        icon: "border-amber-200/15 bg-amber-300/[0.08] text-amber-200",
        active: "border-amber-200/20 bg-amber-300/[0.085] text-amber-100",
        glow: "from-amber-300/15",
    },
    emerald: {
        icon: "border-emerald-200/15 bg-emerald-300/[0.08] text-emerald-200",
        active: "border-emerald-200/20 bg-emerald-300/[0.085] text-emerald-100",
        glow: "from-emerald-300/15",
    },
    rose: {
        icon: "border-rose-200/15 bg-rose-300/[0.08] text-rose-200",
        active: "border-rose-200/20 bg-rose-300/[0.085] text-rose-100",
        glow: "from-rose-300/15",
    },
}

export function PostsTabView({
    scheduledPosts,
    draftPosts,
    postedPosts,
    failedPosts,
    workspaceId,
    workspaceName,
    defaultTab = "scheduled",
}: PostsTabViewProps) {
    const router = useRouter()
    const normalizedDefault = defaultTab in viewMeta ? defaultTab as PostView : "scheduled"
    const [activeView, setActiveView] = useState<PostView>(normalizedDefault)
    const [searchQuery, setSearchQuery] = useState("")

    const postsByView: Record<PostView, ScheduledPostCard[]> = {
        scheduled: scheduledPosts,
        drafts: draftPosts,
        posted: postedPosts,
        failed: failedPosts,
    }
    const counts: Record<PostView, number> = {
        scheduled: scheduledPosts.length,
        drafts: draftPosts.length,
        posted: postedPosts.length,
        failed: failedPosts.length,
    }
    const pipelineSize = counts.scheduled + counts.drafts
    const currentMeta = viewMeta[activeView]
    const currentPosts = postsByView[activeView]
    const CurrentIcon = currentMeta.icon

    const visiblePosts = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
        if (!normalizedQuery) return currentPosts

        return currentPosts.filter((post) => {
            const platformText = Array.isArray(post.platforms)
                ? post.platforms.join(" ")
                : post.platforms?.selection?.join(" ") || ""
            const dateText = post.scheduled_for || post.published_at || ""
            return [post.content || "", platformText, dateText]
                .join(" ")
                .toLocaleLowerCase()
                .includes(normalizedQuery)
        })
    }, [currentPosts, searchQuery])

    const selectView = (view: PostView) => {
        setActiveView(view)
        setSearchQuery("")
        router.replace(`/dashboard/scheduled?tab=${view}`, { scroll: false })
    }

    return (
        <section className="space-y-5" aria-labelledby="content-pipeline-heading">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#10131e] shadow-[0_28px_90px_rgba(2,4,12,0.34)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(139,92,246,0.18),transparent_35%),radial-gradient(circle_at_92%_8%,rgba(34,211,238,0.13),transparent_34%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-200/45 to-transparent" />

                <div className="relative grid gap-8 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:p-8">
                    <div className="flex min-w-0 flex-col justify-between gap-8">
                        <div>
                            <div className="mb-5 flex flex-wrap items-center gap-2">
                                <span className="sf-kicker">
                                    <Radio className="h-3.5 w-3.5" aria-hidden="true" />
                                    Content pipeline
                                </span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">
                                    {workspaceName}
                                </span>
                            </div>

                            <h1 id="content-pipeline-heading" className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                                From first draft to
                                <span className="block bg-linear-to-r from-violet-200 via-white to-cyan-200 bg-clip-text text-transparent">
                                    delivered content.
                                </span>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                                Keep the queue focused, catch provider failures quickly, and move every post through a clear publishing lifecycle.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <CreatePostTrigger workspaceId={workspaceId}>
                                <button
                                    type="button"
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/20 bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:brightness-105"
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Create content
                                </button>
                            </CreatePostTrigger>
                            <Link
                                href="/dashboard/posts"
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.085] hover:text-white"
                            >
                                <ListFilter className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                                Browse published content
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Pipeline health</p>
                        <div className="mt-2 flex items-end justify-between gap-4">
                            <div>
                                <p className="text-3xl font-semibold tracking-[-0.04em] text-white tabular-nums">{pipelineSize}</p>
                                <p className="mt-1 text-xs text-white/35">items currently in progress</p>
                            </div>
                            <span className={cn(
                                "rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]",
                                counts.failed > 0
                                    ? "border-rose-200/15 bg-rose-300/[0.08] text-rose-100/75"
                                    : "border-emerald-200/15 bg-emerald-300/[0.08] text-emerald-100/75",
                            )}>
                                {counts.failed > 0 ? `${counts.failed} to review` : "Clear"}
                            </span>
                        </div>

                        <div className="mt-6 grid grid-cols-4 gap-1.5">
                            {(Object.keys(viewMeta) as PostView[]).map((view) => (
                                <div key={view} className="rounded-xl border border-white/[0.05] bg-white/[0.025] px-2 py-3 text-center">
                                    <p className="text-lg font-semibold tracking-[-0.03em] text-white/78 tabular-nums">{counts[view]}</p>
                                    <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-[0.11em] text-white/25">{viewMeta[view].shortLabel}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(Object.keys(viewMeta) as PostView[]).map((view) => {
                    const meta = viewMeta[view]
                    const Icon = meta.icon
                    const tone = toneStyles[meta.tone]
                    const active = activeView === view

                    return (
                        <button
                            key={view}
                            type="button"
                            onClick={() => selectView(view)}
                            className={cn(
                                "group relative overflow-hidden rounded-2xl border p-4 text-left transition hover:-translate-y-0.5",
                                active ? tone.active : "border-white/[0.07] bg-[#11141e] hover:border-white/[0.13] hover:bg-[#141824]",
                            )}
                            aria-pressed={active}
                        >
                            <div className={cn("pointer-events-none absolute inset-0 bg-linear-to-br to-transparent opacity-50", tone.glow)} />
                            <div className="relative flex items-start justify-between gap-3">
                                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", tone.icon)}>
                                    <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                                </span>
                                <span className="text-2xl font-semibold tracking-[-0.04em] text-white tabular-nums">{counts[view]}</span>
                            </div>
                            <div className="relative mt-5">
                                <p className="text-sm font-semibold text-white/78">{meta.shortLabel}</p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/32">{meta.description}</p>
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="rounded-[24px] border border-white/[0.07] bg-[#10131c] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", toneStyles[currentMeta.tone].icon)}>
                            <CurrentIcon className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold tracking-[-0.02em] text-white/82">{currentMeta.label}</h2>
                            <p className="mt-1 text-xs leading-5 text-white/34">{currentMeta.description}</p>
                        </div>
                    </div>

                    <label className="relative w-full lg:w-80">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                        <span className="sr-only">Search the current content view</span>
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder={`Search ${currentMeta.shortLabel.toLocaleLowerCase()}`}
                            className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-10 pr-3 text-sm text-white/78 outline-none transition placeholder:text-white/25 focus:border-cyan-200/25 focus:bg-white/[0.055]"
                        />
                    </label>
                </div>
            </div>

            {searchQuery && visiblePosts.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/[0.09] bg-[#10131c] px-6 py-14 text-center">
                    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-white/24">
                        <Sparkles className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-base font-semibold text-white/72">No matching content</h2>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/34">Try a broader phrase or clear the search to return to the full {currentMeta.shortLabel.toLocaleLowerCase()} view.</p>
                    <button type="button" onClick={() => setSearchQuery("")} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.045] px-4 text-xs font-semibold text-white/68 transition hover:bg-white/[0.08] hover:text-white">
                        Clear search
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                </div>
            ) : (
                <ScheduledPostsList
                    posts={visiblePosts}
                    workspaceId={workspaceId}
                    status={currentMeta.status}
                />
            )}
        </section>
    )
}
