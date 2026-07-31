import { redirect } from "next/navigation"

import { PostsTabView } from "@/components/scheduled/posts-tab-view"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { createClient } from "@/utils/supabase/server"

const allowedTabs = new Set(["scheduled", "drafts", "posted", "failed"])

export default async function ScheduledPostsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const [resolvedSearchParams, activeWorkspace] = await Promise.all([
        searchParams,
        getActiveWorkspace(),
    ])

    if (!activeWorkspace) {
        redirect("/dashboard/onboarding")
    }

    const supabase = await createClient()
    const workspaceId = activeWorkspace.id

    const [scheduledResult, draftResult, postedResult, failedResult] = await Promise.all([
        supabase
            .from("posts")
            .select("*")
            .eq("status", "scheduled")
            .eq("workspace_id", workspaceId)
            .order("scheduled_for", { ascending: true }),
        supabase
            .from("posts")
            .select("*")
            .eq("status", "draft")
            .eq("workspace_id", workspaceId)
            .order("updated_at", { ascending: false }),
        supabase
            .from("posts")
            .select("*")
            .eq("status", "published")
            .eq("workspace_id", workspaceId)
            .order("published_at", { ascending: false }),
        supabase
            .from("posts")
            .select("*")
            .eq("status", "failed")
            .eq("workspace_id", workspaceId)
            .order("updated_at", { ascending: false }),
    ])

    const requestedTab = typeof resolvedSearchParams.tab === "string"
        ? resolvedSearchParams.tab
        : "scheduled"
    const normalizedTab = requestedTab === "published" ? "posted" : requestedTab
    const defaultTab = allowedTabs.has(normalizedTab) ? normalizedTab : "scheduled"

    return (
        <PostsTabView
            scheduledPosts={scheduledResult.data || []}
            draftPosts={draftResult.data || []}
            postedPosts={postedResult.data || []}
            failedPosts={failedResult.data || []}
            workspaceId={workspaceId}
            workspaceName={activeWorkspace.name}
            defaultTab={defaultTab}
        />
    )
}
