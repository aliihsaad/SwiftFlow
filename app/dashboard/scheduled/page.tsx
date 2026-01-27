import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { PostsTabView } from "@/components/scheduled/posts-tab-view"

export default async function ScheduledPostsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const resolvedSearchParams = await searchParams
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    // ... (rest of simple checks)

    if (!activeWorkspace) {
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
                <p>No active workspace selected.</p>
            </div>
        )
    }

    // Fetch posts by status
    const { data: scheduledPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .eq('workspace_id', activeWorkspace.id)
        .order('scheduled_for', { ascending: true })

    const { data: draftPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'draft')
        .eq('workspace_id', activeWorkspace.id)
        // Order drafts by updated_at instead of created_at for better relevance
        .order('updated_at', { ascending: false })

    const { data: postedPosts } = await supabase
        .from('posts')
        .select(`
            *,
            published_posts(
                *,
                post_analytics(*)
            )
        `)
        .eq('status', 'published')
        .eq('workspace_id', activeWorkspace.id)
        .order('published_at', { ascending: false })

    const { data: failedPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'failed')
        .eq('workspace_id', activeWorkspace.id)
        .order('updated_at', { ascending: false })

    // Determine default tab from search params
    const tab = typeof resolvedSearchParams.tab === 'string' ? resolvedSearchParams.tab : 'scheduled'
    const allowedTabs = ['scheduled', 'drafts', 'posted', 'failed']
    const defaultTab = allowedTabs.includes(tab) ? tab : 'scheduled'

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Posts</h2>
                <p className="text-muted-foreground">Manage all your posts for {activeWorkspace.name}.</p>
            </div>

            <PostsTabView
                scheduledPosts={scheduledPosts || []}
                draftPosts={draftPosts || []}
                postedPosts={postedPosts || []}
                failedPosts={failedPosts || []}
                workspaceId={activeWorkspace.id}
                defaultTab={defaultTab}
            />
        </div>
    )
}
