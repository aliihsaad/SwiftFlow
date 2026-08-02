import type { WorkspaceRole } from "@/types/workspace"
import {
  DEVELOPER_API_SCOPE_VALUES,
  type DeveloperApiCapability,
  type DeveloperApiCapabilityReport,
  type DeveloperApiScope,
} from "./types"

const SCOPE_SET = new Set<string>(DEVELOPER_API_SCOPE_VALUES)
const SCOPE_CAPABILITIES: Record<DeveloperApiScope, { label: string; capability: DeveloperApiCapability }> = {
  "workspace:read": {
    label: "Read workspace",
    capability: {
      area: "Workspace",
      level: "read",
      description: "Read workspace id, name, and API metadata.",
    },
  },
  "brand:read": {
    label: "Read brand profile",
    capability: {
      area: "Brand profile",
      level: "read",
      description: "Read workspace brand profile fields.",
    },
  },
  "brand:write": {
    label: "Edit brand profile",
    capability: {
      area: "Brand profile",
      level: "write",
      description: "Read and update workspace brand profile fields.",
    },
  },
  "automations:read": {
    label: "Read automations",
    capability: {
      area: "Automations",
      level: "read",
      description: "List workspace automations, connected social account ids, supported node types, and automation configuration.",
    },
  },
  "automations:create": {
    label: "Create automations",
    capability: {
      area: "Automations",
      level: "write",
      description: "Create workspace automations for connected social accounts.",
    },
  },
  "automations:update": {
    label: "Edit automations",
    capability: {
      area: "Automations",
      level: "write",
      description: "Update automation names, triggers, replies, DMs, and workflow graphs.",
    },
  },
  "automations:toggle": {
    label: "Activate or disable automations",
    capability: {
      area: "Automations",
      level: "write",
      description: "Turn automations on or off without changing their configuration.",
    },
  },
  "automations:delete": {
    label: "Delete automations",
    capability: {
      area: "Automations",
      level: "write",
      description: "Delete workspace automations.",
    },
  },
  "analytics:read": {
    label: "Read analytics",
    capability: {
      area: "Analytics",
      level: "read",
      description: "Read aggregate workspace analytics and content performance summaries.",
    },
  },
}

export function isDeveloperApiScope(value: string): value is DeveloperApiScope {
  return SCOPE_SET.has(value)
}

export function canRoleCreateDeveloperApiKey(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin"
}

export function normalizeDeveloperApiScopes(values: unknown[]): DeveloperApiScope[] {
  const scopes: DeveloperApiScope[] = []
  for (const value of values) {
    if (typeof value !== "string" || !isDeveloperApiScope(value)) {
      throw new Error("Unsupported developer API scope: " + String(value))
    }
    if (!scopes.includes(value)) scopes.push(value)
  }
  if (scopes.length === 0) {
    throw new Error("At least one developer API scope is required")
  }
  return scopes
}


export function normalizeStoredDeveloperApiScopes(values: unknown[]): DeveloperApiScope[] {
  return Array.from(new Set(
    values.filter((value): value is DeveloperApiScope => typeof value === "string" && isDeveloperApiScope(value)),
  ))
}
export function requireDeveloperApiScopes(
  granted: readonly DeveloperApiScope[],
  required: readonly DeveloperApiScope[],
): { allowed: true } | { allowed: false; missingScopes: DeveloperApiScope[] } {
  const missingScopes = required.filter((scope) => !granted.includes(scope))
  return missingScopes.length === 0 ? { allowed: true } : { allowed: false, missingScopes }
}

export function getDeveloperApiCapabilities(scopes: readonly DeveloperApiScope[]): DeveloperApiCapabilityReport {
  const access = scopes.map((scope) => SCOPE_CAPABILITIES[scope].capability)
  return {
    summary: scopes.map((scope) => SCOPE_CAPABILITIES[scope].label),
    access,
  }
}

export function getDeveloperApiScopeOptions() {
  return DEVELOPER_API_SCOPE_VALUES.map((scope) => ({
    scope,
    label: SCOPE_CAPABILITIES[scope].label,
    capability: SCOPE_CAPABILITIES[scope].capability,
  }))
}
