import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { PostsTabView } from "@/components/scheduled/posts-tab-view"
import { CalendarDays } from "lucide-react"

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
        .select('*')
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
                <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold mb-2"
                    style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.2)', color: '#fcd34d' }}
                >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Scheduled
                </div>
                <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>Posts</h2>
                <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>Manage all your posts for {activeWorkspace.name}.</p>
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
