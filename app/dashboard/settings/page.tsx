import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { SettingsView } from "@/components/settings/settings-view"
import { redirect } from "next/navigation"
import { Workspace, WorkspaceRole } from "@/types/workspace"
import { getCurrentWorkspaceSettingsForDisplay } from "@/app/actions/settings"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { TeamMemberRow, WorkspaceInviteRow } from "@/types/team"

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
    const settings = await getCurrentWorkspaceSettingsForDisplay()
    const activeWorkspace = await getActiveWorkspace()

    let activeWorkspaceRole: WorkspaceRole | null = null
    let teamMembers: TeamMemberRow[] = []
    let workspaceInvites: WorkspaceInviteRow[] = []
    let inviteFeatureReady = true
    let inviteFeatureMessage: string | null = null

    if (activeWorkspace) {
        const { data: memberRows, error: memberRowsError } = await supabase
            .from("workspace_members")
            .select("id, workspace_id, user_id, role, created_at")
            .eq("workspace_id", activeWorkspace.id)
            .order("created_at", { ascending: true })

        if (memberRowsError) {
            console.error("Failed to load workspace members", memberRowsError)
        } else {
            const baseMembers = (memberRows || []) as {
                id: string
                workspace_id: string
                user_id: string
                role: WorkspaceRole
                created_at: string
            }[]

            activeWorkspaceRole = baseMembers.find((m) => m.user_id === user.id)?.role ?? null

            let emailByUserId = new Map<string, { email: string | null, display_name: string | null }>()

            try {
                const supabaseAdmin = createAdminClient()
                const identityRows = await Promise.all(
                    baseMembers.map(async (member) => {
                        const result = await supabaseAdmin.auth.admin.getUserById(member.user_id)
                        const authUser = result.data?.user
                        const metadata = authUser?.user_metadata as Record<string, unknown> | undefined
                        const displayName = typeof metadata?.full_name === "string"
                            ? metadata.full_name
                            : typeof metadata?.name === "string"
                                ? metadata.name
                                : null

                        return {
                            userId: member.user_id,
                            email: authUser?.email ?? null,
                            display_name: displayName,
                        }
                    })
                )

                emailByUserId = new Map(identityRows.map((row) => [row.userId, { email: row.email, display_name: row.display_name }]))
            } catch (adminIdentityError) {
                console.warn("Member identity lookup unavailable; falling back to user IDs", adminIdentityError)
            }

            teamMembers = baseMembers.map((member) => {
                const identity = emailByUserId.get(member.user_id)
                return {
                    ...member,
                    email: identity?.email ?? null,
                    display_name: identity?.display_name ?? null,
                }
            })
        }

        if (activeWorkspaceRole === "owner") {
            const { data: inviteRows, error: inviteRowsError } = await supabase
                .from("workspace_invites")
                .select("id, workspace_id, email, role, status, token, invited_by, expires_at, accepted_at, accepted_by, created_at")
                .eq("workspace_id", activeWorkspace.id)
                .order("created_at", { ascending: false })

            if (inviteRowsError) {
                if (inviteRowsError.code === "42P01") {
                    inviteFeatureReady = false
                    inviteFeatureMessage = "Run the latest Supabase migration to enable invites."
                } else {
                    console.error("Failed to load workspace invites", inviteRowsError)
                    inviteFeatureMessage = "Invites could not be loaded."
                }
            } else {
                workspaceInvites = (inviteRows || []) as WorkspaceInviteRow[]
            }
        }
    }

    return (
        <SettingsView
            workspaces={workspaces}
            settings={settings}
            activeWorkspace={activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name } : null}
            currentUserId={user.id}
            activeWorkspaceRole={activeWorkspaceRole}
            teamMembers={teamMembers}
            workspaceInvites={workspaceInvites}
            inviteFeatureReady={inviteFeatureReady}
            inviteFeatureMessage={inviteFeatureMessage}
            userEmail={user.email ?? ""}
        />
    )
}
