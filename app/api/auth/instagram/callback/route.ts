import { NextRequest, NextResponse } from "next/server"
import {
  exchangeForLongLivedInstagramToken,
  exchangeInstagramCode,
  fetchInstagramProfile,
  getInstagramAppCredentials,
  getInstagramOAuthScopes,
  getInstagramRedirectUri,
  InstagramApiError,
  resolveInstagramProfessionalAccountId,
  subscribeInstagramAutomationWebhooks,
} from "@/lib/instagram-onboarding"
import { sanitizeInstagramDiagnosticValue } from "@/lib/instagram-onboarding-diagnostics"
import { buildMetaAccountMetadata, encryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const INSTAGRAM_OAUTH_STATE_COOKIE = "instagram_oauth_state"
const INSTAGRAM_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000
const INSTAGRAM_CALLBACK_ROUTE = "/api/auth/instagram/callback"

function tokenExpiry(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}

export async function GET(request: NextRequest) {
  const requestId = request.headers.get("x-vercel-id")
  let stage = "validate_oauth_response"
  const clearStateCookie = (response: NextResponse) => {
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    })
    return response
  }
  const redirect = (query: string) => clearStateCookie(
    NextResponse.redirect(new URL(`/dashboard/onboarding/instagram?${query}`, request.url)),
  )
  const redirectError = (error: string, errorStage: string, code?: string | null) => {
    const params = new URLSearchParams({ error, stage: errorStage })
    const safeCode = sanitizeInstagramDiagnosticValue(code)
    if (safeCode) params.set("code", safeCode)
    return redirect(params.toString())
  }
  const logFailure = (
    errorStage: string,
    code: string,
    level: "warning" | "error" = "error",
  ) => {
    const payload = JSON.stringify({
      level,
      message: "Instagram connection callback failed",
      route: INSTAGRAM_CALLBACK_ROUTE,
      stage: errorStage,
      code,
      requestId,
    })
    if (level === "warning") console.warn(payload)
    else console.error(payload)
  }

  const oauthError = request.nextUrl.searchParams.get("error")
  if (oauthError) {
    const code = sanitizeInstagramDiagnosticValue(oauthError) || "provider_denied"
    logFailure("validate_oauth_response", code, "warning")
    return redirectError("instagram_authorization_denied", "validate_oauth_response", code)
  }
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const stateCookie = request.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !stateCookie) {
    logFailure("validate_oauth_state", "missing_oauth_parameters", "warning")
    return redirectError("invalid_oauth_state", "validate_oauth_state", "missing_oauth_parameters")
  }

  stage = "validate_oauth_state"
  let workspaceId: string
  try {
    const parsed = JSON.parse(Buffer.from(stateCookie, "base64url").toString("utf8")) as {
      nonce?: unknown
      workspaceId?: unknown
      createdAt?: unknown
    }
    const createdAt = Number(parsed.createdAt || 0)
    if (
      parsed.nonce !== state
      || typeof parsed.workspaceId !== "string"
      || !Number.isFinite(createdAt)
      || Date.now() - createdAt > INSTAGRAM_OAUTH_STATE_MAX_AGE_MS
    ) {
      throw new Error("Invalid state")
    }
    workspaceId = parsed.workspaceId
  } catch {
    logFailure(stage, "state_mismatch_or_expired", "warning")
    return redirectError("invalid_oauth_state", stage, "state_mismatch_or_expired")
  }

  try {
    stage = "authenticate_user"
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      logFailure(stage, "unauthorized", "warning")
      return redirectError("unauthorized", stage, "unauthorized")
    }
    stage = "authorize_workspace"
    await requireWorkspacePermission(supabase, user.id, workspaceId, "integrations:write")

    stage = "exchange_authorization_code"
    const { appId, appSecret } = getInstagramAppCredentials()
    const redirectUri = getInstagramRedirectUri()
    const requestedScopes = getInstagramOAuthScopes()
    const shortLived = await exchangeInstagramCode({
      code,
      appId,
      appSecret,
      redirectUri,
      requestedScopes,
    })

    let accessToken = shortLived.access_token
    let expiresIn = shortLived.expires_in
    let longLived = false
    stage = "exchange_long_lived_token"
    try {
      const exchanged = await exchangeForLongLivedInstagramToken({
        accessToken,
        appSecret,
      })
      accessToken = exchanged.access_token
      expiresIn = exchanged.expires_in ?? expiresIn
      longLived = true
    } catch (error) {
      if (!(error instanceof InstagramApiError)) throw error
      console.warn(JSON.stringify({
        level: "warning",
        message: "Instagram long-lived token exchange unavailable; continuing with short-lived token",
        route: INSTAGRAM_CALLBACK_ROUTE,
        stage,
        code: error.code,
        requestId,
      }))
    }

    stage = "fetch_profile"
    const profile = await fetchInstagramProfile(accessToken)
    stage = "verify_account_identity"
    const instagramAccountId = resolveInstagramProfessionalAccountId({
      tokenUserId: shortLived.user_id,
      profile,
    })

    stage = "subscribe_webhooks"
    let webhookStatus: "active" | "error" = "error"
    let subscribedFields: string[] = []
    let webhookErrorCode: string | null = null
    try {
      const subscription = await subscribeInstagramAutomationWebhooks({
        accountId: instagramAccountId,
        accessToken,
        grantedScopes: shortLived.permissions,
      })
      webhookStatus = subscription.active ? "active" : "error"
      subscribedFields = subscription.subscribedFields
      webhookErrorCode = subscription.active ? null : "comments_not_confirmed"
    } catch (error) {
      webhookErrorCode = error instanceof InstagramApiError ? error.code : "subscription_failed"
    }

    stage = "check_existing_connection"
    const admin = createAdminClient()
    const { data: duplicate, error: duplicateError } = await admin
      .from("social_accounts")
      .select("workspace_id")
      .eq("platform", "instagram")
      .eq("account_id", instagramAccountId)
      .neq("workspace_id", workspaceId)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) {
      logFailure(stage, "instagram_account_connected_elsewhere")
      return redirectError(
        "instagram_account_connected_elsewhere",
        stage,
        "instagram_account_connected_elsewhere",
      )
    }

    stage = "load_existing_account"
    const { data: existing, error: existingError } = await admin
      .from("social_accounts")
      .select("metadata")
      .eq("workspace_id", workspaceId)
      .eq("platform", "instagram")
      .maybeSingle()
    if (existingError) throw existingError

    const now = new Date().toISOString()
    const metadata: MetaAccountMetadata = {
      ...buildMetaAccountMetadata({
        existingMetadata: existing?.metadata && typeof existing.metadata === "object"
          ? existing.metadata as MetaAccountMetadata
          : undefined,
        grantedScopes: shortLived.permissions,
        instagramBusinessAccountId: instagramAccountId,
        igUsername: profile.username,
        tokenStatus: "available",
        syncedAt: now,
      }),
      connection_method: "instagram_login",
      instagram_login_scoped_id: profile.id,
      instagram_oauth_user_id: shortLived.user_id ?? null,
      account_type: profile.account_type,
      scope_source: shortLived.permissionsSource,
      token_health: "valid",
      token_checked_at: now,
      token_issued_at: now,
      webhook_subscription_status: webhookStatus,
      webhook_subscribed_fields: subscribedFields,
      webhook_checked_at: now,
      webhook_error_code: webhookErrorCode,
      token_lifetime: longLived ? "long_lived" : "short_lived",
    }

    stage = "save_connection"
    const { error: upsertError } = await admin
      .from("social_accounts")
      .upsert({
        workspace_id: workspaceId,
        platform: "instagram",
        account_name: `@${profile.username}`,
        account_id: instagramAccountId,
        access_token: encryptMetaToken(accessToken),
        refresh_token: null,
        token_expires_at: tokenExpiry(expiresIn),
        metadata,
      }, { onConflict: "workspace_id,platform" })
    if (upsertError) throw upsertError

    console.log(JSON.stringify({
      level: "info",
      message: "Instagram connection callback completed",
      route: INSTAGRAM_CALLBACK_ROUTE,
      stage: "complete",
      webhookStatus,
      requestId,
    }))
    return redirect(webhookStatus === "active"
      ? "success=instagram_connected"
      : "success=instagram_connected&subscription=action_required")
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      logFailure(stage, "forbidden", "warning")
      return redirectError("forbidden", stage, "forbidden")
    }
    if (error instanceof InstagramApiError) {
      logFailure(stage, error.code)
      return redirectError("instagram_api_error", stage, error.code)
    }
    const objectCode = error && typeof error === "object" && "code" in error
      ? sanitizeInstagramDiagnosticValue(String(error.code))
      : null
    const errorCode = objectCode
      || sanitizeInstagramDiagnosticValue(error instanceof Error ? error.name : null)
      || "unexpected_error"
    logFailure(stage, errorCode)
    return redirectError("instagram_connection_failed", stage, errorCode)
  }
}
