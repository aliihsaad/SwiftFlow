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
    const [activeView, setActiveView] = useState<PostView>(defaultTab as PostView);
    const [isSyncing, setIsSyncing] = useState(false);
    const { toast } = useToast();
    const router = useRouter();

    const handleSyncAnalytics = async () => {
        setIsSyncing(true);
        try {
            const response = await fetch('/api/sync-analytics', {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to sync analytics');
            }

            const data = await response.json();

            toast({
                title: "Analytics synced!",
                description: `Updated insights for ${data.synced || 0} posts.`,
            });

            // Refresh the page to show updated data
            router.refresh();
        } catch (error) {
            toast({
                title: "Sync failed",
                description: "Could not fetch latest insights. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const viewConfig = {
        scheduled: {
            icon: Calendar,
            label: "Scheduled",
            posts: scheduledPosts,
            status: "scheduled" as const,
        },
        drafts: {
            icon: FileText,
            label: "Drafts",
            posts: draftPosts,
            status: "draft" as const,
        },
        posted: {
            icon: CheckCircle2,
            label: "Posted",
            posts: postedPosts,
            status: "published" as const,
        },
        failed: {
            icon: XCircle,
            label: "Failed",
            posts: failedPosts,
            status: "failed" as const,
        },
    };

    const currentView = viewConfig[activeView];
    const Icon = currentView.icon;

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:justify-between">
                <Select value={activeView} onValueChange={(value) => setActiveView(value as PostView)}>
                    <SelectTrigger className="w-full sm:w-[280px]">
                        <SelectValue>
                            <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                <span>{currentView.label}</span>
                                {currentView.posts.length > 0 && (
                                    <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${activeView === 'failed'
                                            ? 'bg-destructive/20 text-destructive'
                                            : 'bg-primary/20'
                                        }`}>
                                        {currentView.posts.length}
                                    </span>
                                )}
                            </div>
                        </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                        {Object.entries(viewConfig).map(([key, config]) => {
                            const ViewIcon = config.icon;
                            return (
                                <SelectItem key={key} value={key}>
                                    <div className="flex items-center gap-2">
                                        <ViewIcon className="h-4 w-4" />
                                        <span>{config.label}</span>
                                        {config.posts.length > 0 && (
                                            <span className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${key === 'failed'
                                                    ? 'bg-destructive/20 text-destructive'
                                                    : 'bg-primary/20'
                                                }`}>
                                                {config.posts.length}
                                            </span>
                                        )}
                                    </div>
                                </SelectItem>
                            );
                        })}
                    </SelectContent>
                </Select>

                <Button
                    onClick={handleSyncAnalytics}
                    disabled={isSyncing}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Insights'}
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
