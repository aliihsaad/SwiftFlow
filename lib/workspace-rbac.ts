import type { WorkspaceRole } from "@/types/workspace"

export type WorkspacePermission =
    | "workspace:read"
    | "content:write"
    | "automation:write"
    | "settings:write"
    | "integrations:write"
    | "members:manage"
    | "analytics:sync"
    | "billing:manage"

export const WORKSPACE_PERMISSION_ROLE_MAP: Record<WorkspacePermission, WorkspaceRole[]> = {
    "workspace:read": ["owner", "admin", "editor", "viewer"],
    "content:write": ["owner", "admin", "editor"],
    "automation:write": ["owner", "admin"],
    "settings:write": ["owner", "admin"],
    "integrations:write": ["owner", "admin"],
    "members:manage": ["owner"],
    "analytics:sync": ["owner", "admin"],
    "billing:manage": ["owner"],
}

export function hasWorkspacePermissionByRole(
    role: WorkspaceRole | null | undefined,
    permission: WorkspacePermission
): boolean {
    if (!role) return false
    return WORKSPACE_PERMISSION_ROLE_MAP[permission].includes(role)
}

export function formatWorkspacePermission(permission: WorkspacePermission) {
    return permission.replace(":", " ")
}
