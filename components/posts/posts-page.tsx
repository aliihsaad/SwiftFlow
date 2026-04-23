"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { PostCard } from "@/components/posts/post-card"
import { PostCommentsDrawer } from "@/components/posts/post-comments-drawer"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { useToast } from "@/components/ui/use-toast"
import {
    Instagram,
    Facebook,
    RefreshCw,
    Grid3X3,
    AlertCircle
} from "lucide-react"

interface PostData {
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

interface MediaResponse {
    media: PostData[]
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

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok && res.status !== 200) {
        const err = new Error(data.error || 'Failed to fetch') as Error & {
            errorCode?: string
            missingPermissions?: string[]
            requiresReconnect?: boolean
        }
        err.errorCode = data.errorCode
        err.missingPermissions = data.missingPermissions
        err.requiresReconnect = data.requiresReconnect
        throw err
    }
    return data
}

const POSTS_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    text: 'rgba(255,255,255,0.9)',
    muted: 'rgba(255,255,255,0.5)',
    mutedSoft: 'rgba(255,255,255,0.35)',
    mutedFaint: 'rgba(255,255,255,0.25)',
    instagram: '#fb7185',
    instagramSoft: 'rgba(251,113,133,0.14)',
    facebook: '#38bdf8',
    facebookSoft: 'rgba(56,189,248,0.14)',
}

export default function PostsPage() {
    const [activePlatform, setActivePlatform] = useState<'instagram' | 'facebook'>('instagram')
    const [facebookSourceFilter, setFacebookSourceFilter] = useState<'all' | 'native_discovered' | 'app_managed'>('all')
    const [selectedPost, setSelectedPost] = useState<PostData | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const { toast } = useToast()

    useEffect(() => {
        const fetchWorkspace = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return
            const { data } = await supabase
                .from('workspace_members')
                .select('workspace_id')
                .eq('user_id', user.id)
                .limit(1)
                .single()
            if (data) setWorkspaceId(data.workspace_id)
        }
        fetchWorkspace()
    }, [])

    const { data, error, isLoading, isValidating, mutate } = useSWR<MediaResponse>(
        `/api/posts-media?platform=${activePlatform}&limit=25`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
            keepPreviousData: true,
        }
    )

    const hasBlockingPostsError = !!error
    const media = hasBlockingPostsError ? [] : data?.media || []
    const filteredMedia = activePlatform === 'facebook' && facebookSourceFilter !== 'all'
        ? media.filter((post) => post.source === facebookSourceFilter)
        : media
    const account = hasBlockingPostsError ? null : data?.account
    const contentDiscoveryUnavailable = !hasBlockingPostsError ? data?.contentDiscoveryUnavailable : null
    const noAccount = data?.error && !data?.media?.length
    const showInitialLoading = isLoading && !data && !error
    const showRefreshingHint = (isRefreshing || isValidating) && !!data

    const handlePostClick = (post: PostData) => {
        setSelectedPost(post)
        setDrawerOpen(true)
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await mutate()
            toast({ title: "Posts refreshed", description: "Latest posts and comments counts were updated." })
        } catch (error: unknown) {
            toast({
                title: "Refresh failed",
                description: error instanceof Error ? error.message : "Could not refresh posts.",
                variant: "destructive",
            })
        } finally {
            setIsRefreshing(false)
        }
    }

    const handlePostUpdated = (updatedPost: PostData) => {
        setSelectedPost(updatedPost)
        mutate((current) => {
            if (!current?.media) return current
            return {
                ...current,
                media: current.media.map((post) => post.id === updatedPost.id ? updatedPost : post),
            }
        }, { revalidate: false })
    }

    const handlePostDeleted = (postId: string) => {
        setSelectedPost(null)
        mutate((current) => {
            if (!current?.media) return current
            return {
                ...current,
                media: current.media.filter((post) => post.id !== postId),
            }
        }, { revalidate: false })
    }

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            activeStyle: { background: POSTS_THEME.instagramSoft, border: '1px solid rgba(251,113,133,0.25)', color: '#ffe4ea', boxShadow: '0 8px 24px rgba(251,113,133,0.12)' },
            dot: POSTS_THEME.instagram,
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            activeStyle: { background: POSTS_THEME.facebookSoft, border: '1px solid rgba(56,189,248,0.25)', color: '#dff6ff', boxShadow: '0 8px 24px rgba(56,189,248,0.12)' },
            dot: POSTS_THEME.facebook,
        },
    ]

    const facebookSourceSummary = {
        native: media.filter((post) => post.source === 'native_discovered').length,
        app: media.filter((post) => post.source === 'app_managed').length,
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold mb-2"
                        style={{ background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.18)', color: '#dff6ff' }}
                    >
                        <Grid3X3 className="h-3.5 w-3.5" />
                        Posts
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: POSTS_THEME.text }}>
                        Posts
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: POSTS_THEME.mutedSoft }}>
                        View your posts, inspect Page-native content, and manage comments
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isLoading || isRefreshing}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold self-start transition-all duration-150 disabled:opacity-50"
                    style={{
                        background: POSTS_THEME.panelAlt,
                        border: `1px solid ${POSTS_THEME.border}`,
                        color: POSTS_THEME.muted,
                    }}
                >
                    <RefreshCw className={cn("h-3.5 w-3.5", (isLoading || isRefreshing) && "animate-spin")} />
                    {isRefreshing ? 'Refreshing…' : 'Refresh'}
                </button>
            </div>

            {/* Platform Tabs */}
            <div className="flex gap-2">
                {tabs.map((tab) => {
                    const isActive = activePlatform === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActivePlatform(tab.id)}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                            style={
                                isActive
                                    ? tab.activeStyle
                                    : {
                                          background: POSTS_THEME.panelAlt,
                                          border: `1px solid ${POSTS_THEME.border}`,
                                          color: POSTS_THEME.muted,
                                      }
                            }
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {activePlatform === 'facebook' && (
                <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.16)' }}
                >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-1">
                            <div className="text-sm font-semibold text-white/88">Facebook Page content library</div>
                            <p className="text-xs leading-relaxed" style={{ color: POSTS_THEME.mutedSoft }}>
                                Browse all loaded Facebook posts or focus only on native Page content discovered via the approved `pages_read_engagement` permission.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {[
                                { id: 'all' as const, label: `All (${media.length})` },
                                { id: 'native_discovered' as const, label: `Native Page (${facebookSourceSummary.native})` },
                                { id: 'app_managed' as const, label: `App-Managed (${facebookSourceSummary.app})` },
                            ].map((filter) => {
                                const isActive = facebookSourceFilter === filter.id
                                return (
                                    <button
                                        key={filter.id}
                                        type="button"
                                        onClick={() => setFacebookSourceFilter(filter.id)}
                                        className="rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150"
                                        style={isActive
                                            ? {
                                                background: 'rgba(56,189,248,0.14)',
                                                border: '1px solid rgba(56,189,248,0.24)',
                                                color: '#dff6ff',
                                            }
                                            : {
                                                background: POSTS_THEME.panelAlt,
                                                border: `1px solid ${POSTS_THEME.border}`,
                                                color: POSTS_THEME.muted,
                                            }}
                                    >
                                        {filter.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {activePlatform === 'facebook' && contentDiscoveryUnavailable && (
                <div
                    className="rounded-xl p-4"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                    <div className="text-sm font-semibold" style={{ color: '#fbbf24' }}>
                        Native Page discovery unavailable
                    </div>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: POSTS_THEME.muted }}>
                        {contentDiscoveryUnavailable.error}
                    </p>
                    {!!contentDiscoveryUnavailable.missingPermissions?.length && (
                        <p className="mt-2 text-xs" style={{ color: POSTS_THEME.mutedSoft }}>
                            Missing on current token: <span className="font-semibold text-white/70">{contentDiscoveryUnavailable.missingPermissions.join(', ')}</span>
                        </p>
                    )}
                    {contentDiscoveryUnavailable.requiresReconnect && (
                        <a
                            href="/dashboard/settings/brand"
                            className="mt-3 inline-flex rounded-lg px-3 py-2 text-xs font-semibold"
                            style={{
                                background: 'rgba(245,158,11,0.12)',
                                border: '1px solid rgba(245,158,11,0.22)',
                                color: '#fde68a',
                            }}
                        >
                            Reconnect in Brand Settings
                        </a>
                    )}
                </div>
            )}

            {/* Account info */}
            {account && (
                <div className="flex items-center gap-2 text-xs" style={{ color: POSTS_THEME.mutedSoft }}>
                    <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: activePlatform === 'instagram' ? POSTS_THEME.instagram : POSTS_THEME.facebook }}
                    />
                    Connected as{' '}
                    <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                        {account.account_name}
                    </span>
                </div>
            )}

            {showRefreshingHint && (
                <InlineLoadingHint label="Updating posts…" className="w-fit" />
            )}

            {/* Initial Loading Skeleton */}
            {showInitialLoading && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div
                            key={`post-skeleton-${index}`}
                            className="overflow-hidden rounded-xl animate-pulse"
                            style={{ background: POSTS_THEME.panel, border: `1px solid ${POSTS_THEME.border}` }}
                        >
                            <div className="aspect-square" style={{ background: 'rgba(255,255,255,0.04)' }} />
                            <div className="p-3 space-y-2">
                                <div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                <div className="h-3 w-2/3 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && !showInitialLoading && (
                <div
                    className="rounded-xl p-8 text-center"
                    style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)' }}
                >
                    <AlertCircle className="h-7 w-7 mx-auto mb-3" style={{ color: '#f87171' }} />
                    <p className="text-sm font-medium" style={{ color: '#f87171' }}>Failed to load posts</p>
                    <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{error.message}</p>
                    {(error as Error & { missingPermissions?: string[]; requiresReconnect?: boolean }).requiresReconnect && (
                        <div className="mt-4 space-y-2">
                            {!!(error as Error & { missingPermissions?: string[] }).missingPermissions?.length && (
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                    Missing on current token: {(error as Error & { missingPermissions?: string[] }).missingPermissions?.join(', ')}
                                </p>
                            )}
                            <a
                                href="/dashboard/settings/brand"
                                className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold"
                                style={{
                                    background: 'rgba(248,113,113,0.12)',
                                    border: '1px solid rgba(248,113,113,0.22)',
                                    color: '#fecdd3',
                                }}
                            >
                                Reconnect in Settings
                            </a>
                            <p className="mx-auto max-w-xl text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.34)' }}>
                                If this still appears after reconnecting, remove SwiftFlow from Facebook Business Integrations, then connect again so Meta prompts for the approved Page scopes.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* No account connected */}
            {noAccount && !showInitialLoading && (
                <div
                    className="rounded-xl p-12 text-center"
                    style={{ background: POSTS_THEME.panel, border: `1px dashed ${POSTS_THEME.border}` }}
                >
                    <Grid3X3 className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: POSTS_THEME.muted }}>
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm mt-2" style={{ color: POSTS_THEME.mutedFaint }}>
                        Connect your account in Settings to view your posts.
                    </p>
                </div>
            )}

            {/* Posts Grid */}
            {!showInitialLoading && !error && filteredMedia.length > 0 && (
                <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 transition-opacity", showRefreshingHint && "opacity-90")}>
                    {filteredMedia.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            onClick={() => handlePostClick(post)}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!showInitialLoading && !error && !noAccount && filteredMedia.length === 0 && (
                <div
                    className="rounded-xl p-12 text-center"
                    style={{ background: POSTS_THEME.panel, border: `1px dashed ${POSTS_THEME.border}` }}
                >
                    <Grid3X3 className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: POSTS_THEME.muted }}>
                        {activePlatform === 'facebook' && facebookSourceFilter !== 'all' ? 'No posts match this source filter' : 'No posts yet'}
                    </p>
                    <p className="text-sm mt-2" style={{ color: POSTS_THEME.mutedFaint }}>
                        {activePlatform === 'facebook' && facebookSourceFilter !== 'all'
                            ? 'Try another source filter or refresh to load more Facebook Page content.'
                            : 'Posts will appear here once you publish content.'}
                    </p>
                </div>
            )}

            {/* Comments Drawer */}
            <PostCommentsDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                post={selectedPost}
                platform={activePlatform}
                workspaceId={workspaceId || ""}
                onPostUpdated={handlePostUpdated}
                onPostDeleted={handlePostDeleted}
            />
        </div>
    )
}
