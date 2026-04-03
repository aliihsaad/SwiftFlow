import { NextRequest, NextResponse } from "next/server"

/**
 * Legacy OAuth callback intentionally disabled.
 * The app must use /api/auth/meta/callback as the canonical Meta OAuth callback.
 */
export async function GET(request: NextRequest) {
    const redirectUrl = new URL("/dashboard/settings/brand", request.url)
    redirectUrl.searchParams.set("error", "legacy_meta_oauth_disabled")
    redirectUrl.searchParams.set("message", "This legacy Meta callback is disabled. Reconnect using the current Meta flow from Brand Settings.")

    return NextResponse.redirect(redirectUrl)
}
