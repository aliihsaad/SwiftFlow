import { createClient } from "@/utils/supabase/server"
import { SettingsView } from "@/components/settings/settings-view"
import { redirect } from "next/navigation"
import { Workspace, WorkspaceRole } from "@/types/workspace"
import { getCurrentWorkspaceSettings } from "@/app/actions/settings"

export default async function SettingsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    // Fetch workspaces with role
    const { data: members, error } = await supabase
        .from('workspace_members')
        .select(`
      role,
      workspaces (
        id, name, slug, owner_id, created_at
      )
    `)
        .eq('user_id', user.id)

    if (error) {
        console.error(error)
        return <div>Error loading workspaces</div>
    }

    // Flatten structure
    const workspaces = (members?.map(m => {
        const ws = m.workspaces
        const workspaceData = Array.isArray(ws) ? ws[0] : ws

        // Explicitly cast to match the expected structure
        if (!workspaceData) return null

        return {
            ...workspaceData,
            role: m.role as WorkspaceRole
        }
    }).filter(Boolean) || []) as (Workspace & { role: WorkspaceRole })[]

    // Fetch current workspace settings
    const settings = await getCurrentWorkspaceSettings()

    return <SettingsView workspaces={workspaces} settings={settings} />
}
