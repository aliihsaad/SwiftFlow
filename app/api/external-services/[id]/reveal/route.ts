import { NextRequest, NextResponse } from "next/server"

import {
  parseExternalServiceSecretField,
  revealExternalServiceSecret,
  type ExternalServiceRow,
} from "@/lib/external-service-credentials"
import { assertJsonBodySize, assertUuid } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

export const runtime = "nodejs"

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
}

function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  const fetchSite = request.headers.get("sec-fetch-site")
  let sameOrigin = false
  try {
    sameOrigin = Boolean(origin) && new URL(origin!).origin === new URL(request.url).origin
  } catch {
    sameOrigin = false
  }

  if (!sameOrigin || fetchSite === "cross-site") {
    throw new Error("Untrusted request origin")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request)
    assertJsonBodySize(request, 4 * 1024)

    const { id: rawId } = await params
    const id = assertUuid(rawId, "external service id")
    const body = await request.json()
    const workspaceId = assertUuid(body?.workspaceId, "workspaceId")
    const field = parseExternalServiceSecretField(body?.field)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS })
    }
    await requireWorkspacePermission(supabase, user.id, workspaceId, "settings:write")

    await enforceRateLimit(
      {
        scope: "external-services:credential-reveal:user",
        subject: `${user.id}:${workspaceId}`,
        limit: 30,
        windowSeconds: 60,
      },
      "Too many credential reveal requests. Please wait and try again.",
    )
    await enforceRateLimit(
      {
        scope: "external-services:credential-reveal:ip",
        subject: getClientIp(request),
        limit: 60,
        windowSeconds: 60,
      },
      "Too many credential reveal requests. Please wait and try again.",
    )

    const admin = createAdminClient()
    const { data, error } = await admin
      .from("external_services")
      .select("password, api_key")
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .maybeSingle()

    if (error) {
      console.error("[EXTERNAL_SERVICES] reveal lookup error:", error)
      return NextResponse.json({ error: "Failed to load credential" }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: "External service not found" }, { status: 404 })
    }

    const value = revealExternalServiceSecret(
      data as Pick<ExternalServiceRow, "password" | "api_key">,
      field,
    )
    return NextResponse.json({ value }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: error.message },
        {
          status: 429,
          headers: { ...NO_STORE_HEADERS, "Retry-After": String(error.retryAfterSeconds) },
        },
      )
    }
    if (
      error instanceof Error &&
      /Invalid workspaceId|Invalid external service id|Invalid credential field|Request payload too large|Invalid content length/i.test(error.message)
    ) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: NO_STORE_HEADERS })
    }
    if (error instanceof Error && error.message === "Untrusted request origin") {
      return NextResponse.json({ error: error.message }, { status: 403, headers: NO_STORE_HEADERS })
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus, headers: NO_STORE_HEADERS },
      )
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: NO_STORE_HEADERS })
  }
}
