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
import { Button } from "@/components/ui/button"

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

    // Fetch active workspace ID client-side
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

    // Fetch media for the active platform
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

    const tabs = [
        {
            id: 'instagram' as const,
            label: 'Instagram',
            icon: Instagram,
            color: 'from-pink-500 to-purple-600',
            textColor: 'text-pink-500',
        },
        {
            id: 'facebook' as const,
            label: 'Facebook',
            icon: Facebook,
            color: 'from-blue-500 to-blue-700',
            textColor: 'text-blue-500',
        },
    ]

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        View your posts and manage comments
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => mutate()}
                    disabled={isLoading}
                    className="gap-2 self-start"
                >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                    Refresh
                </Button>
            </div>

            {/* Platform Tabs */}
            <div className="flex gap-2">
                {tabs.map((tab) => {
                    const isActive = activePlatform === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActivePlatform(tab.id)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                                isActive
                                    ? `bg-linear-to-r ${tab.color} text-white shadow-lg shadow-${tab.id === 'instagram' ? 'pink' : 'blue'}-500/20`
                                    : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                            )}
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </button>
                    )
                })}
            </div>

            {/* Account info */}
            {account && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <div className={cn(
                        "w-2 h-2 rounded-full",
                        activePlatform === 'instagram' ? "bg-pink-500" : "bg-blue-500"
                    )} />
                    Connected as <span className="font-medium text-foreground">{account.account_name}</span>
                </div>
            )}

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <div className="text-center space-y-3">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Loading posts...</p>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && !isLoading && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-center">
                    <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
                    <p className="text-sm font-medium text-destructive">Failed to load posts</p>
                    <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
                </div>
            )}

            {/* No account connected */}
            {noAccount && !isLoading && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-12 text-center">
                    <Grid3X3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">
                        No {activePlatform === 'instagram' ? 'Instagram' : 'Facebook'} account connected
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
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

            {/* Empty state (account connected but no posts) */}
            {!isLoading && !error && !noAccount && media.length === 0 && (
                <div className="rounded-xl border border-border/50 bg-muted/20 p-12 text-center">
                    <Grid3X3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No posts yet</p>
                    <p className="text-sm text-muted-foreground mt-2">
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
