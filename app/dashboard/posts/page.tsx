import { redirect } from "next/navigation"

import PostsPage from "@/components/posts/posts-page"
import { getActiveWorkspace } from "@/lib/workspace-utils"

export default async function DashboardPostsPage() {
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        redirect("/dashboard/onboarding")
    }

    return (
        <PostsPage
            workspaceId={activeWorkspace.id}
            workspaceName={activeWorkspace.name}
        />
    )
}
