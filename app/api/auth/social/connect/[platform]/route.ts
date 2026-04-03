import { NextRequest, NextResponse } from "next/server"

/**
 * Legacy OAuth path intentionally disabled.
 * The app must use /api/auth/meta/login as the single canonical Meta OAuth entry point.
 */
export async function GET(request: NextRequest) {
    const redirectUrl = new URL("/dashboard/settings/brand", request.url)
    redirectUrl.searchParams.set("error", "legacy_meta_oauth_disabled")
    redirectUrl.searchParams.set("message", "This legacy Meta connection route is disabled. Use Connect Facebook Pages from Brand Settings.")

    return NextResponse.redirect(redirectUrl)
}
