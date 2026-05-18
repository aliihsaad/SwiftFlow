import { createAdminClient } from "@/utils/supabase/admin"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
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

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("workspace_entitlements")
    .select("developer_api_enabled")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error) {
    console.error("[developer-api] failed to load entitlement", redactSensitiveLogValue(error))
    return resolveDeveloperApiEntitlementFromInputs(mode, false)
  }

  return resolveDeveloperApiEntitlementFromInputs(mode, Boolean(data?.developer_api_enabled))
}
