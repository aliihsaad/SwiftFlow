import { createHash, randomUUID } from "crypto"
import { createAdminClient } from "@/utils/supabase/admin"
import { getClientIp } from "@/lib/security/rate-limit"
import type { DeveloperApiAuthContext, DeveloperApiScope } from "./types"

export function hashAuditValue(value: string | null | undefined): string | null {
  const normalized = (value || "").trim()
  if (!normalized) return null
  return createHash("sha256").update(normalized).digest("hex")
}

export function getDeveloperApiRequestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 160) || randomUUID()
}

export async function writeDeveloperApiAuditLog(params: {
  request: Request
  requestId?: string
  context?: DeveloperApiAuthContext | null
  keyPrefix?: string | null
  workspaceId?: string | null
  action: string
  route: string
  scopesRequired?: readonly DeveloperApiScope[]
  statusCode: number
  errorCode?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    const admin = createAdminClient()
    const context = params.context || null
    const workspaceId = params.workspaceId || context?.workspaceId || null
    await admin.from("workspace_api_key_audit_logs").insert({
      workspace_id: workspaceId,
      api_key_id: context?.apiKeyId || null,
      key_prefix: params.keyPrefix || context?.keyPrefix || null,
      actor_type: context ? "api_key" : "system",
      request_id: params.requestId || getDeveloperApiRequestId(params.request),
      method: params.request.method,
      route: params.route.slice(0, 240),
      action: params.action.slice(0, 160),
      scopes_required: [...(params.scopesRequired || [])],
      status_code: params.statusCode,
      ip_hash: hashAuditValue(getClientIp(params.request)),
      user_agent_hash: hashAuditValue(params.request.headers.get("user-agent")),
      error_code: params.errorCode || null,
      metadata: params.metadata || {},
    })
  } catch (error) {
    console.error("[developer-api] failed to write audit log", error)
  }
}
