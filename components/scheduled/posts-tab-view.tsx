"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScheduledPostsList } from "./scheduled-posts-list"
import { Calendar, FileText, CheckCircle2, XCircle } from "lucide-react"

interface PostsTabViewProps {
    scheduledPosts: any[]
    draftPosts: any[]
    postedPosts: any[]
    failedPosts: any[]
    workspaceId: string
    defaultTab?: string
}

export function PostsTabView({ scheduledPosts, draftPosts, postedPosts, failedPosts, workspaceId, defaultTab = "scheduled" }: PostsTabViewProps) {
    return (
        <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full max-w-2xl grid-cols-4">
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
