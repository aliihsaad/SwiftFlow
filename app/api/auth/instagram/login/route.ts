import { NextRequest, NextResponse } from "next/server"
import {
  buildInstagramAuthorizationUrl,
  getInstagramAppCredentials,
  getInstagramOAuthScopes,
  getInstagramRedirectUri,
} from "@/lib/instagram-onboarding"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"
import { createClient } from "@/utils/supabase/server"

const INSTAGRAM_OAUTH_STATE_COOKIE = "instagram_oauth_state"
const INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId")
    if (!workspaceId) {
      return NextResponse.json({ error: "Missing workspaceId parameter" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await requireWorkspacePermission(supabase, user.id, workspaceId, "integrations:write")

    let appId: string
    let redirectUri: string
    try {
      appId = getInstagramAppCredentials().appId
      redirectUri = getInstagramRedirectUri()
    } catch {
      return NextResponse.redirect(
        new URL("/dashboard/onboarding/instagram?error=instagram_app_not_configured", request.url),
      )
    }

    const nonce = crypto.randomUUID()
    const statePayload = Buffer.from(JSON.stringify({
      nonce,
      workspaceId,
      createdAt: Date.now(),
    }), "utf8").toString("base64url")
    const authUrl = buildInstagramAuthorizationUrl({
      appId,
      redirectUri,
      state: nonce,
      scopes: getInstagramOAuthScopes(),
    })
    const response = NextResponse.redirect(authUrl)
    response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, statePayload, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: INSTAGRAM_OAUTH_STATE_MAX_AGE_SECONDS,
    })
    return response
  } catch (error) {
    const permissionStatus = getWorkspacePermissionErrorStatus(error)
    if (permissionStatus) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Forbidden" },
        { status: permissionStatus },
      )
    }
    console.error("[INSTAGRAM_LOGIN] Failed to start Instagram Login")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
