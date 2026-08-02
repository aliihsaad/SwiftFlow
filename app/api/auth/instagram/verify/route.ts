import { NextRequest, NextResponse } from "next/server"
import {
  deriveInstagramAutomationHealth,
  fetchInstagramProfile,
  getInstagramWebhookSubscription,
  InstagramApiError,
} from "@/lib/instagram-onboarding"
import { decryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { workspaceId?: unknown }
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await requireWorkspacePermission(supabase, user.id, workspaceId, "integrations:write")

    const admin = createAdminClient()
    const { data: account, error: accountError } = await admin
      .from("social_accounts")
      .select("id, account_id, access_token, metadata")
      .eq("workspace_id", workspaceId)
      .eq("platform", "instagram")
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) {
      return NextResponse.json({ error: "Instagram is not connected" }, { status: 404 })
    }
    const accessToken = decryptMetaToken(account.access_token)
    if (!accessToken) {
      return NextResponse.json({ error: "Instagram connection has no usable token" }, { status: 409 })
    }

    const current = account.metadata && typeof account.metadata === "object"
      ? account.metadata as MetaAccountMetadata
      : {}
    const profileResult = await Promise.allSettled([
      fetchInstagramProfile(accessToken),
      getInstagramWebhookSubscription({ accountId: account.account_id, accessToken }),
    ])
    const now = new Date().toISOString()
    const profile = profileResult[0]
    const subscription = profileResult[1]
    const tokenInvalid = profile.status === "rejected"
      && profile.reason instanceof InstagramApiError
      && [400, 401, 403].includes(profile.reason.status)
    const nextMetadata: MetaAccountMetadata = {
      ...current,
      token_health: tokenInvalid ? "invalid" : profile.status === "fulfilled" ? "valid" : current.token_health,
      token_checked_at: now,
      account_type: profile.status === "fulfilled" ? profile.value.account_type : current.account_type,
      ig_username: profile.status === "fulfilled" ? profile.value.username : current.ig_username,
      webhook_subscription_status: subscription.status === "fulfilled"
        ? subscription.value.active ? "active" : "missing"
        : "error",
      webhook_subscribed_fields: subscription.status === "fulfilled"
        ? subscription.value.subscribedFields
        : current.webhook_subscribed_fields || [],
      webhook_checked_at: now,
      webhook_error_code: subscription.status === "rejected"
        ? subscription.reason instanceof InstagramApiError
          ? subscription.reason.code
          : "verification_failed"
        : null,
    }
    const { error: updateError } = await admin
      .from("social_accounts")
      .update({
        account_name: profile.status === "fulfilled" ? `@${profile.value.username}` : undefined,
        metadata: nextMetadata,
      })
      .eq("id", account.id)
    if (updateError) throw updateError

    const health = deriveInstagramAutomationHealth({
      connected: true,
      accountType: nextMetadata.account_type,
      grantedScopes: nextMetadata.granted_scopes,
      tokenHealth: nextMetadata.token_health,
      webhookStatus: nextMetadata.webhook_subscription_status,
      subscribedFields: nextMetadata.webhook_subscribed_fields,
    })
    return NextResponse.json({ success: profile.status === "fulfilled", health })
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    return NextResponse.json({ error: "Failed to verify Instagram connection" }, { status: 500 })
  }
}
