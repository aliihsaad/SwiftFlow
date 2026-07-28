"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ScheduledPostsList } from "./scheduled-posts-list"
import type { ScheduledPostCard } from "./scheduled-posts-list"
import { Calendar, FileText, CheckCircle2, XCircle } from "lucide-react"
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
    scheduledPosts: ScheduledPostCard[]
    draftPosts: ScheduledPostCard[]
    postedPosts: ScheduledPostCard[]
    failedPosts: ScheduledPostCard[]
    workspaceId: string
    defaultTab?: string
}

type PostView = "scheduled" | "drafts" | "posted" | "failed"

const SCHED_THEME = {
    panel: '#151620',
    panelAlt: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    muted: 'rgba(255,255,255,0.55)',
    cyan: '#38bdf8',
    coral: '#fb7185',
    amber: '#fbbf24',
    lime: '#4ade80',
}

export function PostsTabView({ scheduledPosts, draftPosts, postedPosts, failedPosts, workspaceId, defaultTab = "scheduled" }: PostsTabViewProps) {
    const [activeView, setActiveView] = useState<PostView>(defaultTab as PostView)
    const { toast } = useToast()
    const router = useRouter()

    const viewConfig = {
        scheduled: { icon: Calendar, label: "Scheduled", posts: scheduledPosts, status: "scheduled" as const },
        drafts: { icon: FileText, label: "Drafts", posts: draftPosts, status: "draft" as const },
        posted: { icon: CheckCircle2, label: "Posted", posts: postedPosts, status: "published" as const },
        failed: { icon: XCircle, label: "Failed", posts: failedPosts, status: "failed" as const },
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
                            background: SCHED_THEME.panelAlt,
                            borderColor: SCHED_THEME.border,
                            color: 'rgba(255,255,255,0.85)',
                        }}
                    >
                        <SelectValue>
                            <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" style={{ color: activeView === 'failed' ? '#f87171' : activeView === 'drafts' ? SCHED_THEME.amber : activeView === 'posted' ? SCHED_THEME.lime : SCHED_THEME.cyan }} />
                                <span>{currentView.label}</span>
                                {currentView.posts.length > 0 && (
                                    <span
                                        className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                        style={{
                                            background: activeView === 'failed' ? 'rgba(248,113,113,0.16)' : activeView === 'drafts' ? 'rgba(245,158,11,0.14)' : activeView === 'posted' ? 'rgba(74,222,128,0.14)' : 'rgba(56,189,248,0.14)',
                                            color: activeView === 'failed' ? '#f87171' : activeView === 'drafts' ? '#fcd34d' : activeView === 'posted' ? '#86efac' : '#dff6ff',
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
                            background: SCHED_THEME.panelAlt,
                            border: `1px solid ${SCHED_THEME.border}`,
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
                                        <ViewIcon className="h-4 w-4" style={{ color: isFailed ? '#f87171' : key === 'drafts' ? SCHED_THEME.amber : key === 'posted' ? SCHED_THEME.lime : SCHED_THEME.cyan }} />
                                        <span>{config.label}</span>
                                        {config.posts.length > 0 && (
                                            <span
                                                className="ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold"
                                                style={{
                                                    background: isFailed ? 'rgba(248,113,113,0.15)' : key === 'drafts' ? 'rgba(245,158,11,0.14)' : key === 'posted' ? 'rgba(74,222,128,0.14)' : 'rgba(56,189,248,0.14)',
                                                    color: isFailed ? '#f87171' : key === 'drafts' ? '#fcd34d' : key === 'posted' ? '#86efac' : '#dff6ff',
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

            </div>

            <ScheduledPostsList
                posts={currentView.posts}
                workspaceId={workspaceId}
                status={currentView.status}
            />
        </div>
    )
}
