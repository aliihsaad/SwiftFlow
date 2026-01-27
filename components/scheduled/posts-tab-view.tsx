"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ScheduledPostsList } from "./scheduled-posts-list"
import { Calendar, FileText, CheckCircle2, XCircle, RefreshCw } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { useRouter } from "next/navigation"

interface PostsTabViewProps {
    scheduledPosts: any[]
    draftPosts: any[]
    postedPosts: any[]
    failedPosts: any[]
    workspaceId: string
    defaultTab?: string
}

export function PostsTabView({ scheduledPosts, draftPosts, postedPosts, failedPosts, workspaceId, defaultTab = "scheduled" }: PostsTabViewProps) {
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

    return (
        <Tabs defaultValue={defaultTab} className="w-full">
            <div className="flex items-center justify-between mb-4">
                <TabsList className="grid max-w-2xl grid-cols-4">
                <TabsTrigger value="scheduled" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Scheduled
                    {scheduledPosts.length > 0 && (
                        <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium">
                            {scheduledPosts.length}
                        </span>
                    )}
                </TabsTrigger>
                <TabsTrigger value="drafts" className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Drafts
                    {draftPosts.length > 0 && (
                        <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium">
                            {draftPosts.length}
                        </span>
                    )}
                </TabsTrigger>
                <TabsTrigger value="posted" className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Posted
                    {postedPosts.length > 0 && (
                        <span className="ml-1 rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium">
                            {postedPosts.length}
                        </span>
                    )}
                </TabsTrigger>
                <TabsTrigger value="failed" className="flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    Failed
                    {failedPosts.length > 0 && (
                        <span className="ml-1 rounded-full bg-destructive/20 px-2 py-0.5 text-xs font-medium text-destructive">
                            {failedPosts.length}
                        </span>
                    )}
                </TabsTrigger>
            </TabsList>
                <Button
                    onClick={handleSyncAnalytics}
                    disabled={isSyncing}
                    variant="outline"
                    size="sm"
                    className="ml-auto"
                >
                    <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    {isSyncing ? 'Syncing...' : 'Sync Insights'}
                </Button>
            </div>

            <TabsContent value="scheduled" className="mt-6">
                <ScheduledPostsList posts={scheduledPosts} workspaceId={workspaceId} status="scheduled" />
            </TabsContent>

            <TabsContent value="drafts" className="mt-6">
                <ScheduledPostsList posts={draftPosts} workspaceId={workspaceId} status="draft" />
            </TabsContent>

            <TabsContent value="posted" className="mt-6">
                <ScheduledPostsList posts={postedPosts} workspaceId={workspaceId} status="published" />
            </TabsContent>

            <TabsContent value="failed" className="mt-6">
                <ScheduledPostsList posts={failedPosts} workspaceId={workspaceId} status="failed" />
            </TabsContent>
        </Tabs>
    )
}
