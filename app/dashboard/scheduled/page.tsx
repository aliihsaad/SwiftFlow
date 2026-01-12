import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { ScheduledPostsList } from "@/components/scheduled/scheduled-posts-list"

export default async function ScheduledPostsPage() {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
                <p>No active workspace selected.</p>
            </div>
        )
    }

    const { data: posts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .eq('workspace_id', activeWorkspace.id)
        .order('scheduled_for', { ascending: true })

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Scheduled Posts</h2>
                <p className="text-muted-foreground">View and manage upcoming content for {activeWorkspace.name}.</p>
            </div>

            <ScheduledPostsList posts={posts || []} workspaceId={activeWorkspace.id} />
        </div>
    )
}
