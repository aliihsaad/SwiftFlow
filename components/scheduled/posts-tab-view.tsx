"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScheduledPostsList } from "./scheduled-posts-list"
import { Calendar, FileText, CheckCircle2, XCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface PostsTabViewProps {
    scheduledPosts: any[]
    draftPosts: any[]
    postedPosts: any[]
    failedPosts: any[]
    workspaceId: string
    defaultTab?: string
}

type PostView = "scheduled" | "drafts" | "posted" | "failed"

export function PostsTabView({ scheduledPosts, draftPosts, postedPosts, failedPosts, workspaceId, defaultTab = "scheduled" }: PostsTabViewProps) {
    const [activeView, setActiveView] = useState<PostView>(defaultTab as PostView)
    const [isSyncing, setIsSyncing] = useState(false)
    const { toast } = useToast()
    const router = useRouter()

    const handleSyncAnalytics = async () => {
        setIsSyncing(true)
        try {
            const response = await fetch('/api/sync-analytics', { method: 'POST' })
            if (!response.ok) throw new Error('Failed to sync analytics')
            const data = await response.json()
            toast({ title: "Analytics synced!", description: `Updated insights for ${data.synced || 0} posts.` })
            router.refresh()
        } catch {
            toast({ title: "Sync failed", description: "Could not fetch latest insights. Please try again.", variant: "destructive" })
        } finally {
            setIsSyncing(false)
        }
    }

    const viewConfig = {
        scheduled: { icon: Calendar,    label: "Scheduled", posts: scheduledPosts, status: "scheduled" as const },
        drafts:    { icon: FileText,    label: "Drafts",    posts: draftPosts,     status: "draft"      as const },
        posted:    { icon: CheckCircle2,label: "Posted",    posts: postedPosts,    status: "published"  as const },
        failed:    { icon: XCircle,     label: "Failed",    posts: failedPosts,    status: "failed"     as const },
    }

    const currentView = viewConfig[activeView]
    const Icon = currentView.icon

    return (
        <div className="w-full space-y-5">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:justify-between">

                {/* Dropdown — mobile friendly */}
                <Select value={activeView} onValueChange={(v) => setActiveView(v as PostView)}>
                    <SelectTrigger
                        className="w-full sm:w-[240px] h-9 border font-medium"
                        style={{
                            background: '#12111e',
                            borderColor: 'rgba(139,92,246,0.25)',
                            color: 'rgba(255,255,255,0.85)',
                        }}
                    >
                        <SelectValue>
                            <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" style={{ color: '#a78bfa' }} />
                                <span>{currentView.label}</span>
                                {currentView.posts.length > 0 && (
                                    <span
                                        className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                        style={{
                                            background: activeView === 'failed' ? 'rgba(248,113,113,0.2)' : 'rgba(139,92,246,0.2)',
                                            color: activeView === 'failed' ? '#f87171' : '#a78bfa',
                                        }}
                                    >
                                        {currentView.posts.length}
                                    </span>
                                )}
                            </div>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent
                        style={{
                            background: '#12111e',
                            border: '1px solid rgba(139,92,246,0.2)',
                        }}
                    >
                        {(Object.entries(viewConfig) as [PostView, typeof viewConfig[PostView]][]).map(([key, config]) => {
                            const ViewIcon = config.icon
                            const isFailed = key === 'failed'
                            return (
                                <SelectItem
                                    key={key}
                                    value={key}
                                    className="cursor-pointer"
                                    style={{ color: 'rgba(255,255,255,0.75)' }}
                                >
                                    <div className="flex items-center gap-2">
                                        <ViewIcon className="h-4 w-4" style={{ color: isFailed ? '#f87171' : '#a78bfa' }} />
                                        <span>{config.label}</span>
                                        {config.posts.length > 0 && (
                                            <span
                                                className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                                style={{
                                                    background: isFailed ? 'rgba(248,113,113,0.15)' : 'rgba(139,92,246,0.15)',
                                                    color: isFailed ? '#f87171' : '#a78bfa',
                                                }}
                                            >
                                                {config.posts.length}
                                            </span>
                                        )}
                                    </div>
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>

                {/* Sync button */}
                <Button
                    onClick={handleSyncAnalytics}
                    disabled={isSyncing}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto font-medium"
                    style={{
                        background: '#12111e',
                        borderColor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.55)',
                    }}
                >
                    <RefreshCw className={`h-3.5 w-3.5 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing…' : 'Sync Insights'}
                </Button>
            </div>

            <ScheduledPostsList
                posts={currentView.posts}
                workspaceId={workspaceId}
                status={currentView.status}
            />
        </div>
    )
}
