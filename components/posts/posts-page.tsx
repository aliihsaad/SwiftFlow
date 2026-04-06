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
    Loader2,
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
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok && res.status !== 200) throw new Error(data.error || 'Failed to fetch')
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

    const media = data?.media || []
    const account = data?.account
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
        } catch (error: any) {
            toast({
                title: "Refresh failed",
                description: error?.message || "Could not refresh posts.",
                variant: "destructive",
            })
        } finally {
            setIsRefreshing(false)
        }
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
                        View your posts and manage comments
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
            {!showInitialLoading && !error && media.length > 0 && (
                <div className={cn("grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 transition-opacity", showRefreshingHint && "opacity-90")}>
                    {media.map((post) => (
                        <PostCard
                            key={post.id}
                            post={post}
                            onClick={() => handlePostClick(post)}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!showInitialLoading && !error && !noAccount && media.length === 0 && (
                <div
                    className="rounded-xl p-12 text-center"
                    style={{ background: POSTS_THEME.panel, border: `1px dashed ${POSTS_THEME.border}` }}
                >
                    <Grid3X3 className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: POSTS_THEME.muted }}>No posts yet</p>
                    <p className="text-sm mt-2" style={{ color: POSTS_THEME.mutedFaint }}>
                        Posts will appear here once you publish content.
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
            />
        </div>
    )
}
