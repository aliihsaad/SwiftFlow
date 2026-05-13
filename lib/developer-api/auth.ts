import { createAdminClient } from "@/utils/supabase/admin"
import { getDeveloperApiEntitlement } from "./entitlements"
import { getDeveloperApiKeyPepper, hashDeveloperApiToken, parseDeveloperApiTokenPrefix, timingSafeStringEqual } from "./key-format"
import { enforceDeveloperApiRateLimit, type DeveloperApiRateLimitKind } from "./rate-limit"
import { normalizeDeveloperApiScopes, requireDeveloperApiScopes } from "./scopes"
import type { DeveloperApiAuthContext, DeveloperApiKeyStatus, DeveloperApiScope } from "./types"
import type { WorkspaceRole } from "@/types/workspace"

export class DeveloperApiAuthError extends Error {
  readonly status: number
  readonly code: string
  readonly keyPrefix: string | null

  constructor(message: string, status: number, code: string, keyPrefix: string | null = null) {
    super(message)
    this.name = "DeveloperApiAuthError"
    this.status = status
    this.code = code
    this.keyPrefix = keyPrefix
  }
}

type KeyRow = {
  id: string
  workspace_id: string
  key_prefix: string
  key_hash: string
  scopes: string[]
  status: DeveloperApiKeyStatus
  created_by_role_snapshot: WorkspaceRole | null
  expires_at: string | null
}

function getBearerToken(request: Request): string {
  if (new URL(request.url).searchParams.has("api_key")) {
    throw new DeveloperApiAuthError("API keys must be sent in the Authorization header", 401, "query_token_rejected")
  }

  const header = request.headers.get("authorization") || ""
  const match = header.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new DeveloperApiAuthError("Missing Developer API bearer token", 401, "missing_bearer")
  }
  return match[1].trim()
}

export async function authenticateDeveloperApiRequest(
  request: Request,
  requiredScopes: readonly DeveloperApiScope[],
  rateLimitKind: DeveloperApiRateLimitKind,
): Promise<DeveloperApiAuthContext> {
  const token = getBearerToken(request)
  const keyPrefix = parseDeveloperApiTokenPrefix(token)
  if (!keyPrefix) {
    await enforceDeveloperApiRateLimit({ kind: "failed_auth", request })
    throw new DeveloperApiAuthError("Invalid Developer API token format", 401, "invalid_token_format")
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("workspace_api_keys")
    .select("id, workspace_id, key_prefix, key_hash, scopes, status, created_by_role_snapshot, expires_at")
    .eq("key_prefix", keyPrefix)
    .maybeSingle()

  if (error) {
    throw new DeveloperApiAuthError("Developer API authentication failed", 500, "key_lookup_failed", keyPrefix)
  }
  if (!data) {
    await enforceDeveloperApiRateLimit({ kind: "failed_auth", request })
    throw new DeveloperApiAuthError("Invalid Developer API token", 401, "unknown_key", keyPrefix)
  }

  const row = data as KeyRow
  if (row.status !== "active") {
    throw new DeveloperApiAuthError("Developer API key is not active", 401, "inactive_key", keyPrefix)
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    await admin.from("workspace_api_keys").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", row.id)
    throw new DeveloperApiAuthError("Developer API key has expired", 401, "expired_key", keyPrefix)
  }

  const incomingHash = hashDeveloperApiToken(token, getDeveloperApiKeyPepper())
  if (!timingSafeStringEqual(incomingHash, row.key_hash)) {
    await enforceDeveloperApiRateLimit({ kind: "failed_auth", request })
    throw new DeveloperApiAuthError("Invalid Developer API token", 401, "token_hash_mismatch", keyPrefix)
  }

  const entitlement = await getDeveloperApiEntitlement(row.workspace_id)
  if (!entitlement.allowed) {
    throw new DeveloperApiAuthError("Developer API access requires a paid plan", 403, entitlement.reason, keyPrefix)
  }

  const scopes = normalizeDeveloperApiScopes(Array.isArray(row.scopes) ? row.scopes : [])
  const scopeCheck = requireDeveloperApiScopes(scopes, requiredScopes)
  if (!scopeCheck.allowed) {
    throw new DeveloperApiAuthError(`Missing required scope: ${scopeCheck.missingScopes.join(", ")}`, 403, "missing_scope", keyPrefix)
  }

  const context: DeveloperApiAuthContext = {
    workspaceId: row.workspace_id,
    apiKeyId: row.id,
    keyPrefix: row.key_prefix,
    scopes,
    roleSnapshot: row.created_by_role_snapshot,
  }

  await enforceDeveloperApiRateLimit({ kind: rateLimitKind, context, request })
  await admin
    .from("workspace_api_keys")
    .update({
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)

  return context
}
