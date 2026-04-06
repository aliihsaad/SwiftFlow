"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { InstagramMedia } from "@/types/automation"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Instagram, Check, Image as ImageIcon, Video, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"

interface SocialAccount {
    id: string
    platform: string
    account_name: string
    account_id: string
}

interface PostSelectorProps {
    selectedPost: InstagramMedia | null
    selectedAccountId: string
    onSelect: (post: InstagramMedia, accountId: string) => void
}

const fetcher = async (url: string) => {
    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch')
    return data
}

export function PostSelector({
    selectedPost,
    selectedAccountId,
    onSelect
}: PostSelectorProps) {
    const [accountId, setAccountId] = useState(selectedAccountId)

    // Fetch Instagram accounts
    const { data: accountsData, isLoading: accountsLoading } = useSWR<{ accounts: SocialAccount[] }>(
        '/api/automations/instagram-accounts',
        fetcher
    )

    // Fetch posts for selected account
    const { data: postsData, isLoading: postsLoading } = useSWR<{ media: InstagramMedia[] }>(
        accountId ? `/api/automations/instagram-media?account_id=${accountId}` : null,
        fetcher
    )

    const instagramAccounts = accountsData?.accounts?.filter(a => a.platform === 'instagram') || []

    // Auto-select first account if none selected
    useEffect(() => {
        if (!accountId && instagramAccounts.length > 0) {
            setAccountId(instagramAccounts[0].id)
        }
    }, [instagramAccounts, accountId])

    const handleAccountChange = (newAccountId: string) => {
        setAccountId(newAccountId)
    }

    const handlePostSelect = (post: InstagramMedia) => {
        onSelect(post, accountId)
    }

    const getMediaIcon = (mediaType: string) => {
        switch (mediaType) {
            case 'VIDEO':
                return Video
            case 'CAROUSEL_ALBUM':
                return LayoutGrid
            default:
                return ImageIcon
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium mb-2">Select a Post</h3>
                <p className="text-sm text-muted-foreground">
                    Choose an Instagram post to trigger the automation when users comment on it.
                </p>
            </div>

            {/* Account Selector */}
            <div className="space-y-2">
                <Label>Instagram Account</Label>
                {accountsLoading ? (
                    <Skeleton className="h-10 w-full max-w-xs" />
                ) : instagramAccounts.length === 0 ? (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
                        No Instagram accounts connected. Please connect an Instagram Business account first.
                    </div>
                ) : (
                    <Select value={accountId} onValueChange={handleAccountChange}>
                        <SelectTrigger className="w-full max-w-xs">
                            <SelectValue placeholder="Select an account" />
                        </SelectTrigger>
                        <SelectContent>
                            {instagramAccounts.map((account) => (
                                <SelectItem key={account.id} value={account.id}>
                                    <div className="flex items-center gap-2">
                                        <Instagram className="h-4 w-4 text-pink-500" />
                                        {account.account_name}
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
            </div>

            {/* Posts Grid */}
            <div className="space-y-2">
                <Label>Select Post</Label>
                {postsLoading ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="aspect-square rounded-lg" />
                        ))}
                    </div>
                ) : !postsData?.media || postsData.media.length === 0 ? (
                    <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-8 text-center">
                        {accountId ? 'No posts found for this account.' : 'Select an account to see posts.'}
                    </div>
                ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                        {postsData.media.map((post) => {
                            const isSelected = selectedPost?.id === post.id
                            const MediaIcon = getMediaIcon(post.media_type)

                            return (
                                <button
                                    key={post.id}
                                    onClick={() => handlePostSelect(post)}
                                    className={cn(
                                        "relative aspect-square rounded-lg overflow-hidden group transition-all",
                                        "ring-2 ring-transparent hover:ring-primary/50",
                                        isSelected && "ring-primary ring-offset-2"
                                    )}
                                >
                                    {post.thumbnail_url || post.media_url ? (
                                        <img
                                            src={post.thumbnail_url || post.media_url!}
                                            alt={post.caption || 'Instagram post'}
                                            className="absolute inset-0 w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-muted flex items-center justify-center">
                                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                        </div>
                                    )}

                                    {/* Media type indicator */}
                                    {post.media_type !== 'IMAGE' && (
                                        <div className="absolute top-1 right-1 p-1 bg-black/50 rounded">
                                            <MediaIcon className="h-3 w-3 text-white" />
                                        </div>
                                    )}

                                    {/* Selection indicator */}
                                    {isSelected && (
                                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                                                <Check className="h-4 w-4" />
                                            </div>
                                        </div>
                                    )}

                                    {/* Hover overlay */}
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Selected Post Preview */}
            {selectedPost && (
                <div className="border rounded-lg p-4 bg-muted/30">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wide">Selected Post</Label>
                    <div className="flex items-start gap-3 mt-2">
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden shrink-0">
                            {selectedPost.thumbnail_url || selectedPost.media_url ? (
                                <img
                                    src={selectedPost.thumbnail_url || selectedPost.media_url!}
                                    alt="Selected post"
                                    className="absolute inset-0 w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-muted flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm line-clamp-3">
                                {selectedPost.caption || 'No caption'}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
