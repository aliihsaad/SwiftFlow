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

    // Fetch published posts with their analytics
    const { data: postedPosts, error: postedError } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'published')
        .eq('workspace_id', activeWorkspace.id)
        .order('published_at', { ascending: false })

    // Fetch published_posts and analytics separately
    if (postedPosts && postedPosts.length > 0) {
        const postIds = postedPosts.map(p => p.id)

        const { data: publishedPostsData } = await supabase
            .from('published_posts')
            .select('*')
            .in('post_id', postIds)

        const publishedPostIds = publishedPostsData?.map(pp => pp.id) || []

        const { data: analyticsData } = await supabase
            .from('post_analytics')
            .select('*')
            .in('published_post_id', publishedPostIds)

        // Attach the data to posts
        postedPosts.forEach(post => {
            const relatedPublishedPosts = publishedPostsData?.filter(pp => pp.post_id === post.id) || []
            relatedPublishedPosts.forEach(pp => {
                pp.post_analytics = analyticsData?.filter(a => a.published_post_id === pp.id) || []
            })
            post.published_posts = relatedPublishedPosts
        })
    }

    if (postedError) {
        console.error('Error fetching posted posts:', postedError)
    }

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
