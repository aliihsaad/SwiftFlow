import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { CalendarDays } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
        .gte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Scheduled Posts</h2>
                <p className="text-muted-foreground">View and manage upcoming content for {activeWorkspace.name}.</p>
            </div>

            {!posts || posts.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <div className="p-4 bg-primary/10 rounded-full mb-4">
                        <CalendarDays className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold">No posts scheduled</h3>
                    <p className="text-muted-foreground mt-2 max-w-sm">
                        You don't have any posts scheduled for the future. Create a new post to get started!
                    </p>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {posts.map((post) => (
                        <Card key={post.id}>
                            <CardContent className="pt-6">
                                <div className="flex justify-between items-start mb-4">
                                    <Badge variant="outline">
                                        {new Date(post.scheduled_for).toLocaleDateString()} at {new Date(post.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Badge>
                                </div>
                                <p className="line-clamp-3 text-sm mb-4">{post.content}</p>
                                <div className="text-xs text-muted-foreground capitalize">
                                    Platforms: {Object.keys(post.platforms?.selection || {}).join(', ')}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
