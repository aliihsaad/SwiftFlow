import { NextRequest, NextResponse } from "next/server"
import { InstagramApiError, refreshLongLivedInstagramToken } from "@/lib/instagram-onboarding"
import { decryptMetaToken, encryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import {
  classifyInstagramRefreshFailure,
  type RefreshPolicyConfig,
  type RefreshAttemptResult,
  defaultRefreshPolicyConfig,
} from "@/supabase/functions/_shared/instagram-token-refresh-policy"
import {
  buildTokenRefreshMetadataPatch,
} from "@/supabase/functions/_shared/instagram-token-refresh-state"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { workspaceId?: unknown }
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireWorkspacePermission(supabase, user.id, workspaceId, "integrations:write")

    const admin = createAdminClient()
    const { data: account, error: accountError } = await admin
      .from("social_accounts")
      .select("id, access_token, metadata")
      .eq("workspace_id", workspaceId)
      .eq("platform", "instagram")
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({ error: "Instagram is not connected" }, { status: 404 })
    const accessToken = decryptMetaToken(account.access_token)
    if (!accessToken) return NextResponse.json({ error: "Instagram connection has no usable token" }, { status: 409 })

    const currentMetadata = account.metadata && typeof account.metadata === "object"
      ? account.metadata as MetaAccountMetadata
      : {}

    let result: RefreshAttemptResult
    try {
      const refreshed = await refreshLongLivedInstagramToken(accessToken)
      result = { kind: "success", accessToken: refreshed.access_token, expiresIn: refreshed.expires_in! }
    } catch (error) {
      if (error instanceof InstagramApiError) {
        const failure = classifyInstagramRefreshFailure(error.status, {
          error: {
            message: error.meta?.message,
            code: error.code,
            error_subcode: error.meta?.subcode,
            type: error.meta?.type,
          },
        })
        if (failure.category === "permanent") {
          result = { kind: "permanent", category: failure.categoryCode, reason: failure.reason || failure.categoryCode }
        } else if (failure.category === "too_new") {
          result = { kind: "too_new", retryAfter: failure.retryAfter || new Date(Date.now() + 30 * 60 * 1000) }
        } else {
          result = { kind: "transient", category: failure.categoryCode, retryAfter: failure.retryAfter || new Date() }
        }
      } else {
        result = { kind: "transient", category: "refresh_failed", retryAfter: new Date() }
      }
    }

    const config: RefreshPolicyConfig = defaultRefreshPolicyConfig()
    const now = new Date()
    const metadataPatch = buildTokenRefreshMetadataPatch({
      result,
      existingMetadata: currentMetadata as Record<string, unknown>,
      now,
      config,
    })

    const updatePayload: Record<string, unknown> = {
      metadata: metadataPatch,
      updated_at: now.toISOString(),
    }
    if (result.kind === "success") {
      updatePayload.access_token = encryptMetaToken(result.accessToken)
      updatePayload.token_expires_at = metadataPatch.token_expires_at
    }

    const { error: updateError } = await admin
      .from("social_accounts")
      .update(updatePayload)
      .eq("id", account.id)
    if (updateError) throw updateError

    if (result.kind === "success") {
      return NextResponse.json({ success: true, expiresAt: metadataPatch.token_expires_at })
    }
    if (result.kind === "permanent") {
      return NextResponse.json(
        { error: "Instagram token is expired or revoked", code: "reconnect_required" },
        { status: 410 },
      )
    }
    if (result.kind === "too_new") {
      return NextResponse.json(
        { error: "Instagram token refresh deferred", code: "token_too_new" },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: "Instagram token refresh failed", code: result.category },
      { status: 502 },
    )
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    return NextResponse.json({
      error: "Instagram token refresh failed",
      code: error instanceof InstagramApiError ? error.code : "refresh_failed",
    }, { status: 502 })
  }
}
