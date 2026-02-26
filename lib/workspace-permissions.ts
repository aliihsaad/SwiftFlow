import { createClient } from "@/utils/supabase/server"
import type { WorkspaceRole } from "@/types/workspace"
import {
    type WorkspacePermission,
    formatWorkspacePermission,
    hasWorkspacePermissionByRole,
} from "@/lib/workspace-rbac"

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

export class WorkspacePermissionError extends Error {
    status: number
    constructor(message: string, status = 403) {
        super(message)
        this.name = "WorkspacePermissionError"
        this.status = status
    }
}

export function hasWorkspacePermission(role: WorkspaceRole | null | undefined, permission: WorkspacePermission): boolean {
    return hasWorkspacePermissionByRole(role, permission)
}

export async function getWorkspaceRoleForUser(
    supabase: ServerSupabaseClient,
    userId: string,
    workspaceId: string
): Promise<WorkspaceRole | null> {
    const { data, error } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle()

    if (error) {
        throw new Error(`Failed to validate workspace access: ${error.message}`)
    }

    return (data?.role as WorkspaceRole | undefined) ?? null
}

export async function requireWorkspacePermission(
    supabase: ServerSupabaseClient,
    userId: string,
    workspaceId: string,
    permission: WorkspacePermission
): Promise<WorkspaceRole> {
    const role = await getWorkspaceRoleForUser(supabase, userId, workspaceId)

    if (!role) {
        throw new WorkspacePermissionError("No access to the selected workspace", 403)
    }

    if (!hasWorkspacePermission(role, permission)) {
        throw new WorkspacePermissionError(`Insufficient permissions: ${formatWorkspacePermission(permission)} requires a higher role`, 403)
    }

    return role
}

export function getWorkspacePermissionErrorStatus(error: unknown): number | null {
    return error instanceof WorkspacePermissionError ? error.status : null
}
