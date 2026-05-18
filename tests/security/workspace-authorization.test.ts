import { describe, expect, it } from "vitest"
import {
  WORKSPACE_PERMISSION_ROLE_MAP,
  hasWorkspacePermissionByRole,
  type WorkspacePermission,
} from "@/lib/workspace-rbac"
import {
  WorkspacePermissionError,
  getWorkspaceRoleForUser,
  requireWorkspacePermission,
} from "@/lib/workspace-permissions"
import type { WorkspaceRole } from "@/types/workspace"

type WorkspaceMemberQueryState = {
  requestedTable?: string
  filters: Record<string, unknown>
  role: WorkspaceRole | null
  errorMessage?: string
}

function createWorkspaceMemberClient(state: WorkspaceMemberQueryState) {
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => {
      state.filters[key] = value
      return query
    },
    maybeSingle: async () => ({
      data: state.role ? { role: state.role } : null,
      error: state.errorMessage ? { message: state.errorMessage } : null,
    }),
  }

  return {
    from: (table: string) => {
      state.requestedTable = table
      return query
    },
  }
}

describe("workspace authorization matrix", () => {
  it("keeps the role permission map explicit and least-privilege", () => {
    const expected: Record<WorkspacePermission, WorkspaceRole[]> = {
      "workspace:read": ["owner", "admin", "editor", "viewer"],
      "content:write": ["owner", "admin", "editor"],
      "automation:write": ["owner", "admin"],
      "settings:write": ["owner", "admin"],
      "integrations:write": ["owner", "admin"],
      "members:manage": ["owner"],
      "analytics:sync": ["owner", "admin"],
    }

    expect(WORKSPACE_PERMISSION_ROLE_MAP).toEqual(expected)

    for (const permission of Object.keys(expected) as WorkspacePermission[]) {
      for (const role of ["owner", "admin", "editor", "viewer"] as WorkspaceRole[]) {
        expect(hasWorkspacePermissionByRole(role, permission)).toBe(expected[permission].includes(role))
      }
      expect(hasWorkspacePermissionByRole(null, permission)).toBe(false)
      expect(hasWorkspacePermissionByRole(undefined, permission)).toBe(false)
    }
  })

  it("looks up membership by exact user and workspace before allowing access", async () => {
    const state: WorkspaceMemberQueryState = {
      filters: {},
      role: "admin",
    }
    const client = createWorkspaceMemberClient(state)

    await expect(getWorkspaceRoleForUser(client as never, "user-1", "workspace-1")).resolves.toBe("admin")

    expect(state.requestedTable).toBe("workspace_members")
    expect(state.filters).toEqual({
      user_id: "user-1",
      workspace_id: "workspace-1",
    })
  })

  it("rejects missing membership and insufficient roles", async () => {
    const missingState: WorkspaceMemberQueryState = {
      filters: {},
      role: null,
    }

    await expect(
      requireWorkspacePermission(createWorkspaceMemberClient(missingState) as never, "user-1", "workspace-1", "workspace:read"),
    ).rejects.toMatchObject({
      name: "WorkspacePermissionError",
      status: 403,
      message: "No access to the selected workspace",
    })

    const viewerState: WorkspaceMemberQueryState = {
      filters: {},
      role: "viewer",
    }

    await expect(
      requireWorkspacePermission(createWorkspaceMemberClient(viewerState) as never, "user-1", "workspace-1", "automation:write"),
    ).rejects.toBeInstanceOf(WorkspacePermissionError)
    await expect(
      requireWorkspacePermission(createWorkspaceMemberClient(viewerState) as never, "user-1", "workspace-1", "automation:write"),
    ).rejects.toMatchObject({
      status: 403,
      message: "Insufficient permissions: automation write requires a higher role",
    })
  })
})
