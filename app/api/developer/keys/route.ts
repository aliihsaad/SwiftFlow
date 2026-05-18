import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { getDeveloperApiEntitlement } from "@/lib/developer-api/entitlements"
import { createDeveloperApiToken, getDeveloperApiKeyPepper, hashDeveloperApiToken } from "@/lib/developer-api/key-format"
import {
  canRoleCreateDeveloperApiKey,
  getDeveloperApiCapabilities,
  getDeveloperApiScopeOptions,
  normalizeDeveloperApiScopes,
} from "@/lib/developer-api/scopes"
import type { DeveloperApiKeyMetadata } from "@/lib/developer-api/types"

export const runtime = "nodejs"

function normalizeKeyName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().slice(0, 120) : ""
  if (!name) throw new Error("API key name is required")
  return name
}

function normalizeExpiresAt(value: unknown): string | null {
  if (value == null || value === "") return null
  if (typeof value !== "string") throw new Error("Invalid expiration date")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error("Invalid expiration date")
  if (date.getTime() <= Date.now()) throw new Error("Expiration date must be in the future")
  return date.toISOString()
}

function serializeKey(row: DeveloperApiKeyMetadata) {
  const scopes = normalizeDeveloperApiScopes(row.scopes || [])
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes,
    capabilities: getDeveloperApiCapabilities(scopes),
    status: row.status,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function requireDeveloperApiManager() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const activeWorkspace = await getActiveWorkspace()
  if (!activeWorkspace) {
    return { error: NextResponse.json({ error: "No active workspace" }, { status: 404 }) }
  }

  const role = await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, "settings:write")
  if (!canRoleCreateDeveloperApiKey(role)) {
    return { error: NextResponse.json({ error: "Only workspace owners and admins can manage Developer API keys" }, { status: 403 }) }
  }

  return { supabase, user, activeWorkspace, role }
}

export async function GET() {
  try {
    const manager = await requireDeveloperApiManager()
    if ("error" in manager) return manager.error

    const admin = createAdminClient()
    const entitlement = await getDeveloperApiEntitlement(manager.activeWorkspace.id)
    const { data, error } = await admin
      .from("workspace_api_keys")
      .select("id, workspace_id, name, key_prefix, scopes, status, created_by_user_id, created_by_role_snapshot, expires_at, last_used_at, created_at, updated_at")
      .eq("workspace_id", manager.activeWorkspace.id)
      .order("created_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      entitlement,
      scopeOptions: getDeveloperApiScopeOptions(),
      keys: ((data || []) as DeveloperApiKeyMetadata[]).map(serializeKey),
    })
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/keys] GET", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to load Developer API keys" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const manager = await requireDeveloperApiManager()
    if ("error" in manager) return manager.error

    const entitlement = await getDeveloperApiEntitlement(manager.activeWorkspace.id)
    if (!entitlement.allowed) {
      return NextResponse.json({ error: "Developer API access requires a paid plan", entitlement }, { status: 403 })
    }

    assertJsonBodySize(request, 32 * 1024)
    const body = await request.json().catch(() => ({}))
    const name = normalizeKeyName(body?.name)
    const scopes = normalizeDeveloperApiScopes(Array.isArray(body?.scopes) ? body.scopes : [])
    const expiresAt = normalizeExpiresAt(body?.expiresAt)
    const token = createDeveloperApiToken()
    const admin = createAdminClient()

    const { data, error } = await admin
      .from("workspace_api_keys")
      .insert({
        workspace_id: manager.activeWorkspace.id,
        name,
        key_prefix: token.prefix,
        key_hash: hashDeveloperApiToken(token.plaintext, getDeveloperApiKeyPepper()),
        scopes,
        status: "active",
        created_by_user_id: manager.user.id,
        created_by_role_snapshot: manager.role,
        expires_at: expiresAt,
      })
      .select("id, workspace_id, name, key_prefix, scopes, status, created_by_user_id, created_by_role_snapshot, expires_at, last_used_at, created_at, updated_at")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      key: serializeKey(data as DeveloperApiKeyMetadata),
      plaintext: token.plaintext,
      entitlement,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && /API key name is required|Unsupported developer API scope|At least one developer API scope|Invalid expiration date|Expiration date must be in the future|Request payload too large|Invalid content length/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/keys] POST", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to create Developer API key" }, { status: 500 })
  }
}
