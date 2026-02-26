import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { decryptSecretIfNeeded, encryptSecretIfNeeded, normalizeOptionalSecretInput } from "@/lib/secret-crypto"

type ExternalServiceRow = {
  id: string
  workspace_id: string
  service_name: string
  website: string | null
  email: string | null
  password: string | null
  subscription_tier: string | null
  price: string | null
  api_key: string | null
  created_at: string
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function decryptExternalServiceRow(row: ExternalServiceRow): ExternalServiceRow {
  return {
    ...row,
    password: decryptSecretIfNeeded(row.password),
    api_key: decryptSecretIfNeeded(row.api_key),
  }
}

function buildExternalServicePayload(body: Record<string, unknown>) {
  const serviceName = normalizeOptionalText(body.service_name)
  if (!serviceName) {
    throw new Error("Service name is required")
  }

  return {
    service_name: serviceName,
    website: normalizeOptionalText(body.website),
    email: normalizeOptionalText(body.email),
    password: encryptSecretIfNeeded(normalizeOptionalSecretInput(body.password)),
    subscription_tier: normalizeOptionalText(body.subscription_tier),
    price: normalizeOptionalText(body.price),
    api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(body.api_key)),
  }
}

async function requireAuthorizedWorkspace(workspaceId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error("Unauthorized")
  }
  await requireWorkspacePermission(supabase, user.id, workspaceId, "settings:write")
  return createAdminClient()
}

async function getServiceInWorkspace(supabaseAdmin: ReturnType<typeof createAdminClient>, id: string, workspaceId: string) {
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
    const { id } = await params
    const body = await request.json()
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const supabaseAdmin = await requireAuthorizedWorkspace(workspaceId)
    const { data: existing, error: existingError } = await getServiceInWorkspace(supabaseAdmin, id, workspaceId)
    if (existingError) {
      console.error("[EXTERNAL_SERVICES] PUT lookup error:", existingError)
      return NextResponse.json({ error: "Failed to load external service" }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: "External service not found" }, { status: 404 })
    }

    const payload = buildExternalServicePayload(body as Record<string, unknown>)

    const { data, error } = await supabaseAdmin
      .from("external_services")
      .update(payload)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single()

    if (error) {
      console.error("[EXTERNAL_SERVICES] PUT error:", error)
      return NextResponse.json({ error: "Failed to update external service" }, { status: 500 })
    }

    return NextResponse.json(decryptExternalServiceRow(data as ExternalServiceRow))
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") || ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const supabaseAdmin = await requireAuthorizedWorkspace(workspaceId)
    const { error } = await supabaseAdmin
      .from("external_services")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspaceId)

    if (error) {
      console.error("[EXTERNAL_SERVICES] DELETE error:", error)
      return NextResponse.json({ error: "Failed to delete external service" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
  }
}

