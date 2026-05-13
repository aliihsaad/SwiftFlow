import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { canRoleCreateDeveloperApiKey } from "@/lib/developer-api/scopes"

export const runtime = "nodejs"

function normalizeKeyName(value: unknown): string | null {
  if (value == null) return null
  const name = typeof value === "string" ? value.trim().slice(0, 120) : ""
  if (!name) throw new Error("API key name is required")
  return name
}

function normalizeExpiresAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === "") return null
  if (typeof value !== "string") throw new Error("Invalid expiration date")
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error("Invalid expiration date")
  if (date.getTime() <= Date.now()) throw new Error("Expiration date must be in the future")
  return date.toISOString()
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

  return { user, activeWorkspace }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireDeveloperApiManager()
    if ("error" in manager) return manager.error

    const { id } = await params
    const keyId = assertUuid(id, "API key id")
    assertJsonBodySize(request, 32 * 1024)
    const body = await request.json().catch(() => ({}))
    const name = normalizeKeyName(body?.name)
    const expiresAt = normalizeExpiresAt(body?.expiresAt)
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== null) update.name = name
    if (expiresAt !== undefined) update.expires_at = expiresAt

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("workspace_api_keys")
      .update(update)
      .eq("id", keyId)
      .eq("workspace_id", manager.activeWorkspace.id)
      .select("id, name, key_prefix, scopes, status, expires_at, last_used_at, created_at, updated_at")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ key: data })
  } catch (error) {
    if (error instanceof Error && /API key name is required|Invalid expiration date|Expiration date must be in the future|Invalid API key id|Request payload too large|Invalid content length/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/keys/:id] PATCH", error)
    return NextResponse.json({ error: "Failed to update Developer API key" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const manager = await requireDeveloperApiManager()
    if ("error" in manager) return manager.error

    const { id } = await params
    const keyId = assertUuid(id, "API key id")
    const body = await request.json().catch(() => ({}))
    const revokedReason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 240) : "revoked_by_admin"
    const admin = createAdminClient()

    if (body?.permanent === true) {
      const { data: existing, error: existingError } = await admin
        .from("workspace_api_keys")
        .select("id, status")
        .eq("id", keyId)
        .eq("workspace_id", manager.activeWorkspace.id)
        .maybeSingle()

      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
      if (!existing) return NextResponse.json({ error: "Developer API key not found" }, { status: 404 })
      if (existing.status !== "revoked") {
        return NextResponse.json({ error: "Only revoked API keys can be permanently deleted" }, { status: 400 })
      }

      const { error: deleteError } = await admin
        .from("workspace_api_keys")
        .delete()
        .eq("id", keyId)
        .eq("workspace_id", manager.activeWorkspace.id)

      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })
      return NextResponse.json({ success: true, deleted: true })
    }

    const { error } = await admin
      .from("workspace_api_keys")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: manager.user.id,
        revoked_reason: revokedReason || "revoked_by_admin",
        updated_at: new Date().toISOString(),
      })
      .eq("id", keyId)
      .eq("workspace_id", manager.activeWorkspace.id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && /Invalid API key id/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    console.error("[developer/keys/:id] DELETE", error)
    return NextResponse.json({ error: "Failed to revoke Developer API key" }, { status: 500 })
  }
}
