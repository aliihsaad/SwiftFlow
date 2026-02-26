import { NextRequest, NextResponse } from "next/server"

import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { decryptSecretIfNeeded, encryptSecretIfNeeded, isEncryptedSecret, normalizeOptionalSecretInput } from "@/lib/secret-crypto"

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

  // Credentials are sensitive; require admin+ settings access for read/write.
  await requireWorkspacePermission(supabase, user.id, workspaceId, "settings:write")
  return createAdminClient()
}

export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId")
  if (!workspaceId) {
    return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
  }

  try {
    const supabaseAdmin = await requireAuthorizedWorkspace(workspaceId)
    const { data, error } = await supabaseAdmin
      .from("external_services")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("[EXTERNAL_SERVICES] GET error:", error)
      return NextResponse.json({ error: "Failed to fetch external services" }, { status: 500 })
    }

    const rows = (data || []) as ExternalServiceRow[]

    // Lazy-upgrade legacy plaintext secrets on first read when encryption is configured.
    for (const row of rows) {
      const needsMigration =
        (typeof row.password === "string" && row.password.length > 0 && !isEncryptedSecret(row.password)) ||
        (typeof row.api_key === "string" && row.api_key.length > 0 && !isEncryptedSecret(row.api_key))

      if (!needsMigration) continue

      try {
        await supabaseAdmin
          .from("external_services")
          .update({
            password: encryptSecretIfNeeded(normalizeOptionalSecretInput(row.password)),
            api_key: encryptSecretIfNeeded(normalizeOptionalSecretInput(row.api_key)),
          })
          .eq("id", row.id)
          .eq("workspace_id", workspaceId)
      } catch (migrationError) {
        console.warn("[EXTERNAL_SERVICES] Secret lazy-migration failed:", migrationError)
      }
    }

    return NextResponse.json(rows.map((row) => decryptExternalServiceRow(row)))
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Forbidden" }, { status: permissionStatus })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const supabaseAdmin = await requireAuthorizedWorkspace(workspaceId)
    const payload = buildExternalServicePayload(body as Record<string, unknown>)

    const { data, error } = await supabaseAdmin
      .from("external_services")
      .insert({
        workspace_id: workspaceId,
        ...payload,
      })
      .select("*")
      .single()

    if (error) {
      console.error("[EXTERNAL_SERVICES] POST error:", error)
      return NextResponse.json({ error: "Failed to create external service" }, { status: 500 })
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
