import { NextRequest, NextResponse } from "next/server"

import {
  buildExternalServiceCreatePayload,
  sanitizeExternalServiceForClient,
  type ExternalServiceRow,
} from "@/lib/external-service-credentials"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { needsSecretReencryption, reencryptSecretIfNeeded } from "@/lib/secret-crypto"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
}

async function requireAuthorizedWorkspace(workspaceId: string) {
  const validatedWorkspaceId = assertUuid(workspaceId, "workspaceId")
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Unauthorized")

  await requireWorkspacePermission(supabase, user.id, validatedWorkspaceId, "settings:write")
  return { supabaseAdmin: createAdminClient(), workspaceId: validatedWorkspaceId }
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId")
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
  }

  try {
    const authorized = await requireAuthorizedWorkspace(workspaceId)
    const { data, error } = await authorized.supabaseAdmin
      .from("external_services")
      .select("*")
      .eq("workspace_id", authorized.workspaceId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[EXTERNAL_SERVICES] GET error:", error)
      return NextResponse.json({ error: "Failed to fetch external services" }, { status: 500 })
    }

    const rows = (data || []) as ExternalServiceRow[]
    for (const row of rows) {
      if (!needsSecretReencryption(row.password) && !needsSecretReencryption(row.api_key)) continue

      try {
        await authorized.supabaseAdmin
          .from("external_services")
          .update({
            password: reencryptSecretIfNeeded(row.password),
            api_key: reencryptSecretIfNeeded(row.api_key),
          })
          .eq("id", row.id)
          .eq("workspace_id", authorized.workspaceId)
      } catch (migrationError) {
        console.warn("[EXTERNAL_SERVICES] Secret lazy-migration failed:", migrationError)
      }
    }

    return NextResponse.json(
      rows.map((row) => sanitizeExternalServiceForClient(row)),
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid workspaceId") {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    assertJsonBodySize(request, 32 * 1024)
    const body = await request.json()
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const authorized = await requireAuthorizedWorkspace(workspaceId)
    const payload = buildExternalServiceCreatePayload(body as Record<string, unknown>)

    const { data, error } = await authorized.supabaseAdmin
      .from("external_services")
      .insert({
        workspace_id: authorized.workspaceId,
        ...payload,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[EXTERNAL_SERVICES] POST error:", error)
      return NextResponse.json({ error: "Failed to create external service" }, { status: 500 })
    }

    return NextResponse.json(
      sanitizeExternalServiceForClient(data as ExternalServiceRow),
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (
      error instanceof Error &&
      /Missing workspaceId|Invalid workspaceId|Service name is required|Credential is too long|Request payload too large|Invalid content length/i.test(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
