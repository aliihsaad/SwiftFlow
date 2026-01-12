import { Sidebar } from "@/components/layout/sidebar"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { createClient } from "@/utils/supabase/server"
import { Workspace } from "@/types/workspace"

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    // 1. Get Auth + Active Workspace
    // The middleware ensures we have a session usually, but good to be safe
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // If middleware didn't catch it for some reason (e.g. static gen), return null or shell
    if (!user) return null

    const activeWorkspace = await getActiveWorkspace()

    // 2. Get All Workspaces for Switcher
    const { data: members } = await supabase
        .from('workspace_members')
        .select(`
            workspace_id,
            workspaces (
                id, name, slug, owner_id, created_at
            )
        `)
        .eq('user_id', user.id)

    // Transform joined data to Workspace[]
    // Supabase join returns an array or single object depending on relationship.
    // workspace_id is FK to workspaces (many-to-one), so it should be a single object.
    // But sometimes type generation or runtime behavior implies array.
    const workspaceList = (members?.map(m => {
        const ws = m.workspaces
        return Array.isArray(ws) ? ws[0] : ws
    }).filter(Boolean) || []) as Workspace[]

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar
                workspaces={workspaceList}
                activeWorkspace={activeWorkspace}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
                <header className="flex h-16 items-center gap-4 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                    <h1 className="text-lg font-semibold">
                        {activeWorkspace?.name || 'Dashboard'}
                    </h1>
                    <div className="ml-auto flex items-center gap-4">
                        {/* User Menu / Notifications could go here */}
                    </div>
                </header>
                <main className="flex-1 overflow-y-auto bg-muted/10 p-6">
                    {children}
                </main>
            </div>
        </div>
    )
}
