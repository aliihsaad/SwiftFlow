import { NextRequest, NextResponse } from "next/server"
import {
  exchangeForLongLivedInstagramToken,
  exchangeInstagramCode,
  fetchInstagramProfile,
  getInstagramAppCredentials,
  getInstagramOAuthScopes,
  getInstagramRedirectUri,
  InstagramApiError,
  subscribeInstagramComments,
} from "@/lib/instagram-onboarding"
import { buildMetaAccountMetadata, encryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

const INSTAGRAM_OAUTH_STATE_COOKIE = "instagram_oauth_state"
const INSTAGRAM_OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000

function tokenExpiry(expiresIn: number | undefined): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn) || expiresIn <= 0) return null
  return new Date(Date.now() + expiresIn * 1000).toISOString()
}

export async function GET(request: NextRequest) {
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

  const oauthError = request.nextUrl.searchParams.get("error")
  if (oauthError) {
    return redirect(`error=${encodeURIComponent(oauthError)}`)
  }
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const stateCookie = request.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value
  if (!code || !state || !stateCookie) {
    return redirect("error=invalid_oauth_state")
  }

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
    return redirect("error=invalid_oauth_state")
  }

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return redirect("error=unauthorized")
    await requireWorkspacePermission(supabase, user.id, workspaceId, "integrations:write")

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
    }

    const profile = await fetchInstagramProfile(accessToken)
    if (shortLived.user_id && shortLived.user_id !== profile.id) {
      return redirect("error=instagram_account_mismatch")
    }

    let webhookStatus: "active" | "error" = "error"
    let subscribedFields: string[] = []
    let webhookErrorCode: string | null = null
    try {
      const subscription = await subscribeInstagramComments({
        accountId: profile.id,
        accessToken,
      })
      webhookStatus = subscription.active ? "active" : "error"
      subscribedFields = subscription.subscribedFields
      webhookErrorCode = subscription.active ? null : "comments_not_confirmed"
    } catch (error) {
      webhookErrorCode = error instanceof InstagramApiError ? error.code : "subscription_failed"
    }

    const admin = createAdminClient()
    const { data: duplicate, error: duplicateError } = await admin
      .from("social_accounts")
      .select("workspace_id")
      .eq("platform", "instagram")
      .eq("account_id", profile.id)
      .neq("workspace_id", workspaceId)
      .maybeSingle()
    if (duplicateError) throw duplicateError
    if (duplicate) {
      return redirect("error=instagram_account_connected_elsewhere")
    }

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
        instagramBusinessAccountId: profile.id,
        igUsername: profile.username,
        tokenStatus: "available",
        syncedAt: now,
      }),
      connection_method: "instagram_login",
      account_type: profile.account_type,
      scope_source: shortLived.permissionsSource,
      token_health: "valid",
      token_checked_at: now,
      webhook_subscription_status: webhookStatus,
      webhook_subscribed_fields: subscribedFields,
      webhook_checked_at: now,
      webhook_error_code: webhookErrorCode,
      token_lifetime: longLived ? "long_lived" : "short_lived",
    }

    const { error: upsertError } = await admin
      .from("social_accounts")
      .upsert({
        workspace_id: workspaceId,
        platform: "instagram",
        account_name: `@${profile.username}`,
        account_id: profile.id,
        access_token: encryptMetaToken(accessToken),
        refresh_token: null,
        token_expires_at: tokenExpiry(expiresIn),
        metadata,
      }, { onConflict: "workspace_id,platform" })
    if (upsertError) throw upsertError

    return redirect(webhookStatus === "active"
      ? "success=instagram_connected"
      : "success=instagram_connected&subscription=action_required")
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) return redirect("error=forbidden")
    if (error instanceof InstagramApiError) {
      return redirect(`error=instagram_api_error&code=${encodeURIComponent(error.code)}`)
    }
    console.error("[INSTAGRAM_CALLBACK] Connection failed without exposing provider credentials")
    return redirect("error=instagram_connection_failed")
  }
}
