import { NextRequest, NextResponse } from "next/server"
import { InstagramApiError, refreshLongLivedInstagramToken } from "@/lib/instagram-onboarding"
import { decryptMetaToken, encryptMetaToken, type MetaAccountMetadata } from "@/lib/meta-account"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"

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

    const refreshed = await refreshLongLivedInstagramToken(accessToken)
    const currentMetadata = account.metadata && typeof account.metadata === "object"
      ? account.metadata as MetaAccountMetadata
      : {}
    const now = new Date().toISOString()
    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      : null
    const { error: updateError } = await admin
      .from("social_accounts")
      .update({
        access_token: encryptMetaToken(refreshed.access_token),
        token_expires_at: expiresAt,
        metadata: {
          ...currentMetadata,
          token_health: "valid",
          token_checked_at: now,
          token_lifetime: "long_lived",
        },
      })
      .eq("id", account.id)
    if (updateError) throw updateError

    return NextResponse.json({ success: true, expiresAt })
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
