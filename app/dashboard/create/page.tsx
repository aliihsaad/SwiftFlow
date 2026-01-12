import { getActiveWorkspace } from "@/lib/workspace-utils"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"

export default async function CreatePostPage() {
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
                <p>No active workspace selected.</p>
            </div>
        )
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center space-y-4">
            <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Create New Post</h1>
                <p className="text-muted-foreground">Start creating content for your platforms.</p>
            </div>

            <CreatePostTrigger workspaceId={activeWorkspace.id} />
        </div>
    )
}
