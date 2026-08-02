"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import useSWR from "swr"
import {
    AlertCircle,
    ArrowRight,
    Facebook,
    Grid3X3,
    Instagram,
    RefreshCw,
    Search,
    SlidersHorizontal,
    Sparkles,
} from "lucide-react"

import { PostCard, type PostCardData } from "@/components/posts/post-card"
import { PostCommentsDrawer } from "@/components/posts/post-comments-drawer"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"

type Platform = "instagram" | "facebook"
type FacebookSource = "all" | "native_discovered" | "app_managed"
type SortMode = "newest" | "engagement" | "comments"

interface MediaResponse {
    media: PostCardData[]
    paging: {
        after: string | null
        has_next: boolean
    } | null
    account: {
        id: string
        account_id: string
        account_name: string
        platform: string
    } | null
    error?: string
    partial?: boolean
    contentDiscoveryUnavailable?: {
        error: string
        errorCode?: string
        missingPermissions?: string[]
        requiresReconnect?: boolean
    }
}

interface PostsPageProps {
    workspaceId: string
    workspaceName: string
}

type MediaFetchError = Error & {
    errorCode?: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
}

const fetcher = async (url: string): Promise<MediaResponse> => {
    const response = await fetch(url)
    const data = await response.json()

    if (!response.ok) {
        const error = new Error(data.error || "Failed to fetch posts") as MediaFetchError
        error.errorCode = data.errorCode
        error.missingPermissions = data.missingPermissions
        error.requiresReconnect = data.requiresReconnect
        throw error
    }

    return data
}

export default function PostsPage({ workspaceId, workspaceName }: PostsPageProps) {
    const [activePlatform, setActivePlatform] = useState<Platform>("instagram")
    const [facebookSourceFilter, setFacebookSourceFilter] = useState<FacebookSource>("all")
    const [selectedPost, setSelectedPost] = useState<PostCardData | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [sortMode, setSortMode] = useState<SortMode>("newest")
    const [isRefreshing, setIsRefreshing] = useState(false)
    const { toast } = useToast()

    const { data, error, isLoading, isValidating, mutate } = useSWR<MediaResponse, MediaFetchError>(
        `/api/posts-media?platform=${activePlatform}&limit=25`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30_000,
            keepPreviousData: true,
        },
    )

    const media = useMemo<PostCardData[]>(
        () => error ? [] : data?.media || [],
        [data?.media, error],
    )
    const account = error ? null : data?.account
    const contentDiscoveryUnavailable = error ? null : data?.contentDiscoveryUnavailable
    const noAccount = Boolean(data?.error && !data?.media?.length)
    const showInitialLoading = isLoading && !data && !error
    const showRefreshingHint = (isRefreshing || isValidating) && Boolean(data)

    const sourceCounts = useMemo(() => ({
        native: media.filter((post) => post.source === "native_discovered").length,
        managed: media.filter((post) => post.source === "app_managed").length,
    }), [media])

    const totals = useMemo(() => media.reduce(
        (summary, post) => ({
            likes: summary.likes + (post.like_count || 0),
            comments: summary.comments + (post.comments_count || 0),
        }),
        { likes: 0, comments: 0 },
    ), [media])

    const visibleMedia = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
        const sourceFiltered = activePlatform === "facebook" && facebookSourceFilter !== "all"
            ? media.filter((post) => post.source === facebookSourceFilter)
            : media
        const searched = normalizedQuery
            ? sourceFiltered.filter((post) => post.caption?.toLocaleLowerCase().includes(normalizedQuery))
            : sourceFiltered

        return [...searched].sort((a, b) => {
            if (sortMode === "engagement") {
                return (b.like_count + b.comments_count) - (a.like_count + a.comments_count)
            }
            if (sortMode === "comments") {
                return b.comments_count - a.comments_count
            }
            return Date.parse(b.timestamp) - Date.parse(a.timestamp)
        })
    }, [activePlatform, facebookSourceFilter, media, searchQuery, sortMode])

    const handlePostClick = (post: PostCardData) => {
        setSelectedPost(post)
        setDrawerOpen(true)
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await mutate()
            toast({
                title: "Content refreshed",
                description: "Posts and engagement counts are up to date.",
            })
        } catch (refreshError: unknown) {
            toast({
                title: "Refresh failed",
                description: refreshError instanceof Error ? refreshError.message : "Could not refresh posts.",
                variant: "destructive",
            })
        } finally {
            setIsRefreshing(false)
        }
    }

    const handlePostUpdated = (updatedPost: PostCardData) => {
        setSelectedPost(updatedPost)
        mutate((current) => current?.media
            ? {
                ...current,
                media: current.media.map((post) => post.id === updatedPost.id ? updatedPost : post),
            }
            : current,
        { revalidate: false })
    }

    const handlePostDeleted = (postId: string) => {
        setSelectedPost(null)
        mutate((current) => current?.media
            ? {
                ...current,
                media: current.media.filter((post) => post.id !== postId),
            }
            : current,
        { revalidate: false })
    }

    const reconnectRequired = Boolean(error?.requiresReconnect)

    return (
        <section className="space-y-5" aria-labelledby="content-library-heading">
            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#10131e] shadow-[0_28px_90px_rgba(2,4,12,0.34)]">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.14),transparent_34%),radial-gradient(circle_at_94%_6%,rgba(244,114,182,0.16),transparent_36%)]" />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-200/45 to-transparent" />

                <div className="relative grid gap-8 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] xl:p-8">
                    <div className="flex min-w-0 flex-col justify-between gap-8">
                        <div>
                            <div className="mb-5 flex flex-wrap items-center gap-2">
                                <span className="sf-kicker">
                                    <Grid3X3 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Content library
                                </span>
                                <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/42">
                                    {workspaceName}
                                </span>
                            </div>

                            <h1 id="content-library-heading" className="max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                                Every published story,
                                <span className="block bg-linear-to-r from-cyan-200 via-white to-pink-200 bg-clip-text text-transparent">
                                    organized for action.
                                </span>
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                                Inspect real provider content, review engagement, and move directly into comment management from one focused workspace.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={handleRefresh}
                                disabled={isLoading || isRefreshing}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/74 transition hover:bg-white/[0.085] hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <RefreshCw className={cn("h-4 w-4", (isRefreshing || isValidating) && "animate-spin")} aria-hidden="true" />
                                Refresh library
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Live provider snapshot</p>
                                <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">
                                    {account ? account.account_name : "Awaiting connection"}
                                </p>
                                <p className="mt-1 text-xs text-white/35">
                                    {account ? `${activePlatform === "instagram" ? "Instagram" : "Facebook"} is connected` : "Connect an account to load content"}
                                </p>
                            </div>
                            <span className={cn(
                                "h-2.5 w-2.5 shrink-0 rounded-full",
                                account ? "bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.7)]" : "bg-amber-300",
                            )} />
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-2">
                            <SnapshotMetric label="Posts" value={media.length} />
                            <SnapshotMetric label="Likes" value={totals.likes} />
                            <SnapshotMetric label="Comments" value={totals.comments} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-[24px] border border-white/[0.07] bg-[#10131c] p-4 sm:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="inline-flex w-full rounded-2xl border border-white/[0.07] bg-black/20 p-1 xl:w-auto" aria-label="Content platform">
                        <PlatformButton
                            active={activePlatform === "instagram"}
                            icon={Instagram}
                            label="Instagram"
                            onClick={() => setActivePlatform("instagram")}
                            tone="pink"
                        />
                        <PlatformButton
                            active={activePlatform === "facebook"}
                            icon={Facebook}
                            label="Facebook"
                            onClick={() => setActivePlatform("facebook")}
                            tone="cyan"
                        />
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <label className="relative min-w-0 sm:w-72">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                            <span className="sr-only">Search post captions</span>
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search captions"
                                className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.035] pl-10 pr-3 text-sm text-white/78 outline-none transition placeholder:text-white/25 focus:border-cyan-200/25 focus:bg-white/[0.055]"
                            />
                        </label>
                        <label className="relative sm:w-48">
                            <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/28" aria-hidden="true" />
                            <span className="sr-only">Sort posts</span>
                            <select
                                value={sortMode}
                                onChange={(event) => setSortMode(event.target.value as SortMode)}
                                className="h-11 w-full appearance-none rounded-xl border border-white/[0.08] bg-[#151925] pl-10 pr-8 text-sm text-white/70 outline-none transition focus:border-cyan-200/25"
                            >
                                <option value="newest">Newest first</option>
                                <option value="engagement">Most engaged</option>
                                <option value="comments">Most comments</option>
                            </select>
                        </label>
                    </div>
                </div>

                {activePlatform === "facebook" ? (
                    <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs font-semibold text-white/62">Facebook content source</p>
                            <p className="mt-1 text-[11px] leading-5 text-white/30">Separate Page-native discovery from posts created inside the app.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <SourceButton active={facebookSourceFilter === "all"} label={`All ${media.length}`} onClick={() => setFacebookSourceFilter("all")} />
                            <SourceButton active={facebookSourceFilter === "native_discovered"} label={`Native ${sourceCounts.native}`} onClick={() => setFacebookSourceFilter("native_discovered")} />
                            <SourceButton active={facebookSourceFilter === "app_managed"} label={`Managed ${sourceCounts.managed}`} onClick={() => setFacebookSourceFilter("app_managed")} />
                        </div>
                    </div>
                ) : null}
            </div>

            {activePlatform === "facebook" && contentDiscoveryUnavailable ? (
                <ConnectionNotice
                    title="Native Page discovery needs attention"
                    message={contentDiscoveryUnavailable.error}
                    missingPermissions={contentDiscoveryUnavailable.missingPermissions}
                    reconnect={Boolean(contentDiscoveryUnavailable.requiresReconnect)}
                />
            ) : null}

            {showRefreshingHint ? <InlineLoadingHint label="Updating content library…" className="w-fit" /> : null}

            {showInitialLoading ? <PostsSkeleton /> : null}

            {error && !showInitialLoading ? (
                <div className="rounded-[22px] border border-rose-300/15 bg-rose-300/[0.055] p-7 text-center">
                    <AlertCircle className="mx-auto h-7 w-7 text-rose-300" aria-hidden="true" />
                    <h2 className="mt-3 text-sm font-semibold text-rose-100">Content could not be loaded</h2>
                    <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-rose-100/50">{error.message}</p>
                    {error.missingPermissions?.length ? (
                        <p className="mt-2 text-xs text-white/38">Missing permission: {error.missingPermissions.join(", ")}</p>
                    ) : null}
                    {reconnectRequired ? (
                        <Link href="/dashboard/settings/brand" className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-rose-200/15 bg-rose-200/[0.08] px-4 text-xs font-semibold text-rose-100 transition hover:bg-rose-200/[0.12]">
                            Reconnect account
                        </Link>
                    ) : null}
                </div>
            ) : null}

            {noAccount && !showInitialLoading ? (
                <EmptyLibrary
                    title={`Connect ${activePlatform === "instagram" ? "Instagram" : "Facebook"} to start`}
                    description="Once connected, your real posts and engagement will appear here automatically."
                    actionHref="/dashboard/settings/brand"
                    actionLabel="Open connection settings"
                />
            ) : null}

            {!showInitialLoading && !error && visibleMedia.length > 0 ? (
                <div>
                    <div className="mb-4 flex items-end justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/28">Published content</p>
                            <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-white/82">
                                {visibleMedia.length} {visibleMedia.length === 1 ? "post" : "posts"} in view
                            </h2>
                        </div>
                        {data?.partial ? <span className="rounded-full border border-amber-200/15 bg-amber-200/[0.07] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-100/70">Partial provider data</span> : null}
                    </div>
                    <div className={cn("grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", showRefreshingHint && "opacity-80")}>
                        {visibleMedia.map((post) => (
                            <PostCard key={post.id} post={post} onClick={() => handlePostClick(post)} />
                        ))}
                    </div>
                </div>
            ) : null}

            {!showInitialLoading && !error && !noAccount && visibleMedia.length === 0 ? (
                <EmptyLibrary
                    title={searchQuery ? "No captions match your search" : "No content in this view"}
                    description={searchQuery
                        ? "Try a broader phrase or clear the search to see the full library."
                        : "Change the source filter, refresh the provider, or create your next post."}
                />
            ) : null}

            <PostCommentsDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                post={selectedPost}
                platform={activePlatform}
                workspaceId={workspaceId}
                onPostUpdated={handlePostUpdated}
                onPostDeleted={handlePostDeleted}
            />
        </section>
    )
}

function SnapshotMetric({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl border border-white/[0.055] bg-white/[0.025] p-3">
            <p className="text-xl font-semibold tracking-[-0.035em] text-white tabular-nums">{formatMetric(value)}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/28">{label}</p>
        </div>
    )
}

function PlatformButton({
    active,
    icon: Icon,
    label,
    onClick,
    tone,
}: {
    active: boolean
    icon: typeof Instagram
    label: string
    onClick: () => void
    tone: "pink" | "cyan"
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition xl:flex-none",
                active
                    ? tone === "pink"
                        ? "border border-pink-200/15 bg-pink-300/[0.1] text-pink-100 shadow-[0_10px_28px_rgba(244,114,182,0.08)]"
                        : "border border-cyan-200/15 bg-cyan-300/[0.1] text-cyan-100 shadow-[0_10px_28px_rgba(34,211,238,0.08)]"
                    : "border border-transparent text-white/38 hover:bg-white/[0.04] hover:text-white/65",
            )}
        >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
        </button>
    )
}

function SourceButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                active
                    ? "border-cyan-200/20 bg-cyan-300/[0.09] text-cyan-100"
                    : "border-white/[0.07] bg-white/[0.025] text-white/38 hover:bg-white/[0.05] hover:text-white/62",
            )}
        >
            {label}
        </button>
    )
}

function ConnectionNotice({
    title,
    message,
    missingPermissions,
    reconnect,
}: {
    title: string
    message: string
    missingPermissions?: string[]
    reconnect: boolean
}) {
    return (
        <div className="flex flex-col gap-4 rounded-[22px] border border-amber-200/15 bg-amber-200/[0.055] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200/15 bg-amber-200/[0.08] text-amber-200">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                    <p className="text-sm font-semibold text-amber-100">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-amber-100/50">{message}</p>
                    {missingPermissions?.length ? <p className="mt-1 text-[11px] text-white/34">Missing: {missingPermissions.join(", ")}</p> : null}
                </div>
            </div>
            <Link href="/dashboard/settings/brand" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/15 bg-amber-200/[0.08] px-4 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.12]">
                {reconnect ? "Reconnect account" : "Review connection"}
            </Link>
        </div>
    )
}

function PostsSkeleton() {
    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Loading posts">
            {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse overflow-hidden rounded-[22px] border border-white/[0.06] bg-[#11141e]">
                    <div className="aspect-[4/4.35] bg-white/[0.035]" />
                    <div className="space-y-3 p-4">
                        <div className="h-2.5 w-2/5 rounded-full bg-white/[0.05]" />
                        <div className="h-3.5 rounded-full bg-white/[0.05]" />
                        <div className="h-3.5 w-3/4 rounded-full bg-white/[0.035]" />
                    </div>
                </div>
            ))}
        </div>
    )
}

function EmptyLibrary({
    title,
    description,
    actionHref,
    actionLabel,
}: {
    title: string
    description: string
    actionHref?: string
    actionLabel?: string
}) {
    return (
        <div className="rounded-[24px] border border-dashed border-white/[0.09] bg-[#10131c] px-6 py-14 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-white/24">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-semibold text-white/72">{title}</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-white/34">{description}</p>
            {actionHref && actionLabel ? (
                <Link href={actionHref} className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.045] px-4 text-xs font-semibold text-white/68 transition hover:bg-white/[0.08] hover:text-white">
                    {actionLabel}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
            ) : null}
        </div>
    )
}

function formatMetric(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString()
}
