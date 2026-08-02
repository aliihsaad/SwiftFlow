import { NextRequest, NextResponse } from "next/server"

import {
  buildExternalServiceUpdatePayload,
  sanitizeExternalServiceForClient,
  type ExternalServiceRow,
} from "@/lib/external-service-credentials"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import {
  getWorkspacePermissionErrorStatus,
  requireWorkspacePermission,
  WorkspacePermissionError,
} from "@/lib/workspace-permissions"
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
  if (!user) throw new WorkspacePermissionError("Unauthorized", 401)
  await requireWorkspacePermission(supabase, user.id, validatedWorkspaceId, "settings:write")
  return { supabaseAdmin: createAdminClient(), workspaceId: validatedWorkspaceId }
}

async function getServiceInWorkspace(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  id: string,
  workspaceId: string,
) {
  return supabaseAdmin
    .from("external_services")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .maybeSingle()
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertJsonBodySize(request, 32 * 1024)
    const { id: rawId } = await params
    const id = assertUuid(rawId, "external service id")
    const body = await request.json()
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const authorized = await requireAuthorizedWorkspace(workspaceId)
    const { data: existing, error: existingError } = await getServiceInWorkspace(
      authorized.supabaseAdmin,
      id,
      authorized.workspaceId,
    )
    if (existingError) {
      console.error("[EXTERNAL_SERVICES] PUT lookup error:", existingError)
      return NextResponse.json({ error: "Failed to load external service" }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: "External service not found" }, { status: 404 })
    }

    const payload = buildExternalServiceUpdatePayload(body as Record<string, unknown>)
    const { data, error } = await authorized.supabaseAdmin
      .from("external_services")
      .update(payload)
      .eq("id", id)
      .eq("workspace_id", authorized.workspaceId)
      .select("*")
      .single()

    if (error) {
      console.error("[EXTERNAL_SERVICES] PUT error:", error)
      return NextResponse.json({ error: "Failed to update external service" }, { status: 500 })
    }

    return NextResponse.json(
      sanitizeExternalServiceForClient(data as ExternalServiceRow),
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    if (
      error instanceof Error &&
      /Missing workspaceId|Invalid workspaceId|Invalid external service id|Service name is required|Credential is too long|Request payload too large|Invalid content length/i.test(error.message)
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: rawId } = await params
    const id = assertUuid(rawId, "external service id")
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") || ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const authorized = await requireAuthorizedWorkspace(workspaceId)
    const { error } = await authorized.supabaseAdmin
      .from("external_services")
      .delete()
      .eq("id", id)
      .eq("workspace_id", authorized.workspaceId)

    if (error) {
      console.error("[EXTERNAL_SERVICES] DELETE error:", error)
      return NextResponse.json({ error: "Failed to delete external service" }, { status: 500 })
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (
      error instanceof Error &&
      /Missing workspaceId|Invalid workspaceId|Invalid external service id/i.test(error.message)
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
