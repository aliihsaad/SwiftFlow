import { DashboardHeader } from "@/components/layout/dashboard-header"
import { Sidebar } from "@/components/layout/sidebar"
import { WorkspaceRoleProvider } from "@/components/workspace/workspace-role-provider"
import { isReviewPhase1Release } from "@/lib/release-channel"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import type { Workspace, WorkspaceRole } from "@/types/workspace"
import { createClient } from "@/utils/supabase/server"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) return null

    const activeWorkspace = await getActiveWorkspace()
    const { data: members } = await supabase
        .from("workspace_members")
        .select("role, workspace_id, workspaces (id, name, slug, owner_id, created_at)")
        .eq("user_id", user.id)
    const workspaceList = (members
        ?.map((member) => {
            const workspace = member.workspaces
            return Array.isArray(workspace) ? workspace[0] : workspace
        })
        .filter(Boolean) ?? []) as Workspace[]
    const activeWorkspaceRole = activeWorkspace
        ? ((members?.find((member) => member.workspace_id === activeWorkspace.id)?.role as
              | WorkspaceRole
              | undefined) ?? null)
        : null
    const reviewPhase1Release = isReviewPhase1Release()
    const userInitial = user.email?.charAt(0).toUpperCase() || "U"

    return (
        <WorkspaceRoleProvider role={activeWorkspaceRole}>
            <div className="sf-app-shell">
                <aside className="hidden h-full lg:flex">
                    <Sidebar
                        workspaces={workspaceList}
                        activeWorkspace={activeWorkspace}
                        isReviewPhase1Release={reviewPhase1Release}
                    />
                </aside>

                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <DashboardHeader
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaceList}
                        isReviewPhase1Release={reviewPhase1Release}
                        userInitial={userInitial}
                        userEmail={user.email ?? ""}
                    />

                    <main className="sf-main">{children}</main>
                </div>

            </div>
        </WorkspaceRoleProvider>
    )
}
