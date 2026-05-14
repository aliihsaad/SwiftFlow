import type { WorkspaceRole } from "@/types/workspace"

export const DEVELOPER_API_SCOPE_VALUES = [
  "workspace:read",
  "brand:read",
  "brand:write",
  "media:upload",
  "posts:read",
  "posts:create",
  "posts:schedule",
  "posts:publish_now",
  "posts:update",
  "posts:delete",
  "automations:read",
  "automations:create",
  "automations:update",
  "automations:toggle",
  "automations:delete",
  "analytics:read",
  "content_intelligence:run",
] as const

export type DeveloperApiScope = (typeof DEVELOPER_API_SCOPE_VALUES)[number]
export type DeveloperApiKeyStatus = "active" | "revoked" | "expired"
export type DeveloperApiAccessMode = "off" | "preview" | "paid_only"
export type DeveloperApiCapabilityLevel = "read" | "write" | "run"

export interface DeveloperApiEntitlement {
  allowed: boolean
  mode: DeveloperApiAccessMode
  reason: "disabled" | "preview" | "paid_plan_required" | "allowed"
}

export interface DeveloperApiCapability {
  area: string
  level: DeveloperApiCapabilityLevel
  description: string
}

export interface DeveloperApiCapabilityReport {
  summary: string[]
  access: DeveloperApiCapability[]
}

export interface DeveloperApiAuthContext {
  workspaceId: string
  apiKeyId: string
  keyPrefix: string
  scopes: DeveloperApiScope[]
  roleSnapshot: WorkspaceRole | null
}

export interface DeveloperApiKeyMetadata {
  id: string
  workspace_id: string
  name: string
  key_prefix: string
  scopes: DeveloperApiScope[]
  status: DeveloperApiKeyStatus
  created_by_user_id: string | null
  created_by_role_snapshot: WorkspaceRole | null
  expires_at: string | null
  last_used_at: string | null
  created_at: string
  updated_at: string
}
