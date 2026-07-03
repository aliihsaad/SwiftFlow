import { getWorkspaceEntitlements } from "@/lib/billing/entitlements"
import type { DeveloperApiAccessMode, DeveloperApiEntitlement } from "./types"

export function getDeveloperApiAccessMode(): DeveloperApiAccessMode {
  const raw = process.env.DEVELOPER_API_ACCESS_MODE
  if (raw === "off" || raw === "preview" || raw === "paid_only") return raw
  return "preview"
}

export function resolveDeveloperApiEntitlementFromInputs(
  mode: DeveloperApiAccessMode,
  enabled: boolean,
): DeveloperApiEntitlement {
  if (mode === "off") return { allowed: false, mode, reason: "disabled" }
  if (mode === "preview") return { allowed: true, mode, reason: "preview" }
  return enabled
    ? { allowed: true, mode, reason: "allowed" }
    : { allowed: false, mode, reason: "paid_plan_required" }
}

export async function getDeveloperApiEntitlement(workspaceId: string): Promise<DeveloperApiEntitlement> {
  const mode = getDeveloperApiAccessMode()
  if (mode === "off" || mode === "preview") {
    return resolveDeveloperApiEntitlementFromInputs(mode, false)
  }

  // Single billing entitlement reader: merges the workspace_entitlements row
  // (including manual developer_api_enabled overrides) with the plan tier
  // resolved from the Stripe-synced subscription state.
  const entitlements = await getWorkspaceEntitlements(workspaceId)
  return resolveDeveloperApiEntitlementFromInputs(mode, entitlements.limits.developerApiEnabled)
}
