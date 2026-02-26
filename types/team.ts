import type { WorkspaceRole } from "@/types/workspace"

export type TeamInviteRole = Exclude<WorkspaceRole, "owner">
export type TeamInviteStatus = "pending" | "accepted" | "revoked" | "expired"

export interface TeamMemberRow {
    id: string
    workspace_id: string
    user_id: string
    role: WorkspaceRole
    created_at: string
    email: string | null
    display_name: string | null
}

export interface WorkspaceInviteRow {
    id: string
    workspace_id: string
    email: string
    role: TeamInviteRole
    status: TeamInviteStatus
    token: string
    invited_by: string
    expires_at: string
    accepted_at: string | null
    accepted_by: string | null
    created_at: string
}
