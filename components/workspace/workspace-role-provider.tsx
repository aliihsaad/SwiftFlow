"use client"

import { createContext, useContext } from "react"
import type { WorkspaceRole } from "@/types/workspace"
import { hasWorkspacePermissionByRole, type WorkspacePermission } from "@/lib/workspace-rbac"

interface WorkspaceRoleContextValue {
    role: WorkspaceRole | null
}

const WorkspaceRoleContext = createContext<WorkspaceRoleContextValue | undefined>(undefined)

interface WorkspaceRoleProviderProps {
    role: WorkspaceRole | null
    children: React.ReactNode
}

export function WorkspaceRoleProvider({ role, children }: WorkspaceRoleProviderProps) {
    return (
        <WorkspaceRoleContext.Provider value={{ role }}>
            {children}
        </WorkspaceRoleContext.Provider>
    )
}

export function useWorkspaceRole() {
    const context = useContext(WorkspaceRoleContext)
    return context?.role ?? null
}

export function useWorkspacePermission(permission: WorkspacePermission): boolean {
    const context = useContext(WorkspaceRoleContext)
    if (!context) {
        // Components can render outside dashboard layout; fall back to permissive UI.
        return true
    }
    return hasWorkspacePermissionByRole(context.role, permission)
}
