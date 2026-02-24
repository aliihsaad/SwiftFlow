"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { PostCard } from "@/components/posts/post-card"
import { PostCommentsDrawer } from "@/components/posts/post-comments-drawer"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
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

export default function PostsPage() {
    const [activePlatform, setActivePlatform] = useState<'instagram' | 'facebook'>('instagram')
    const [selectedPost, setSelectedPost] = useState<PostData | null>(null)
    const [drawerOpen, setDrawerOpen] = useState(false)
    const [workspaceId, setWorkspaceId] = useState<string | null>(null)
    const [isRefreshing, setIsRefreshing] = useState(false)

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

    const { data, error, isLoading, mutate } = useSWR<MediaResponse>(
        `/api/posts-media?platform=${activePlatform}&limit=25`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 30000,
        }
    )

    const media = data?.media || []
    const account = data?.account
    const noAccount = data?.error && !data?.media?.length

    const handlePostClick = (post: PostData) => {
        setSelectedPost(post)
        setDrawerOpen(true)
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        try {
            await mutate()
        } finally {
            setIsRefreshing(false)
        }
    }

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            activeStyle: { background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: '#fff', boxShadow: '0 4px 16px rgba(236,72,153,0.25)' },
            dot: '#ec4899',
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            activeStyle: { background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', color: '#fff', boxShadow: '0 4px 16px rgba(59,130,246,0.25)' },
            dot: '#3b82f6',
        },
    ]

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        Posts
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        View your posts and manage comments
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isLoading || isRefreshing}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold self-start transition-all duration-150 disabled:opacity-50"
                    style={{
                        background: '#12111e',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.5)',
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
                                          background: '#12111e',
                                          border: '1px solid rgba(255,255,255,0.08)',
                                          color: 'rgba(255,255,255,0.4)',
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
                <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: activePlatform === 'instagram' ? '#ec4899' : '#3b82f6' }}
                    />
                    Connected as{' '}
                    <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {account.account_name}
                    </span>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-7 w-7 animate-spin mx-auto" style={{ color: '#8b5cf6' }} />
                        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading posts…</p>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && !isLoading && (
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
            {noAccount && !isLoading && (
                <div
                    className="rounded-xl p-12 text-center"
                    style={{ background: '#0e0d1c', border: '1px dashed rgba(255,255,255,0.08)' }}
                >
                    <Grid3X3 className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
                        Connect your account in Settings to view your posts.
                    </p>
                </div>
            )}

            {/* Posts Grid */}
            {!isLoading && !error && media.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
            {!isLoading && !error && !noAccount && media.length === 0 && (
                <div
                    className="rounded-xl p-12 text-center"
                    style={{ background: '#0e0d1c', border: '1px dashed rgba(255,255,255,0.08)' }}
                >
                    <Grid3X3 className="h-10 w-10 mx-auto mb-4" style={{ color: 'rgba(255,255,255,0.12)' }} />
                    <p className="font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>No posts yet</p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.25)' }}>
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
