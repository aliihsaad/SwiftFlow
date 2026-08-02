import { NextRequest, NextResponse } from "next/server"
import { InstagramApiError, subscribeInstagramAutomationWebhooks } from "@/lib/instagram-onboarding"
import { decryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

export async function POST(request: NextRequest) {
  let accountId: string | null = null
  let currentMetadata: MetaAccountMetadata = {}
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
      .select("id, account_id, access_token, metadata")
      .eq("workspace_id", workspaceId)
      .eq("platform", "instagram")
      .maybeSingle()
    if (accountError) throw accountError
    if (!account) return NextResponse.json({ error: "Instagram is not connected" }, { status: 404 })
    accountId = account.id
    currentMetadata = account.metadata && typeof account.metadata === "object"
      ? account.metadata as MetaAccountMetadata
      : {}
    const accessToken = decryptMetaToken(account.access_token)
    if (!accessToken) return NextResponse.json({ error: "Instagram connection has no usable token" }, { status: 409 })

    const subscription = await subscribeInstagramAutomationWebhooks({
      accountId: account.account_id,
      accessToken,
      grantedScopes: currentMetadata.granted_scopes,
    })
    const now = new Date().toISOString()
    const nextMetadata: MetaAccountMetadata = {
      ...currentMetadata,
      webhook_subscription_status: subscription.active ? "active" : "missing",
      webhook_subscribed_fields: subscription.subscribedFields,
      webhook_checked_at: now,
      webhook_error_code: subscription.active ? null : "comments_not_confirmed",
    }
    const { error: updateError } = await admin
      .from("social_accounts")
      .update({ metadata: nextMetadata })
      .eq("id", account.id)
    if (updateError) throw updateError

    return NextResponse.json({
      success: subscription.active,
      subscribedFields: subscription.subscribedFields,
    }, { status: subscription.active ? 200 : 409 })
  } catch (error) {
    if (accountId) {
      const admin = createAdminClient()
      await admin
        .from("social_accounts")
        .update({
          metadata: {
            ...currentMetadata,
            webhook_subscription_status: "error",
            webhook_checked_at: new Date().toISOString(),
            webhook_error_code: error instanceof InstagramApiError ? error.code : "subscription_failed",
          },
        })
        .eq("id", accountId)
    }
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    return NextResponse.json({
      error: "Instagram comment subscription failed",
      code: error instanceof InstagramApiError ? error.code : "subscription_failed",
    }, { status: 502 })
  }
}
