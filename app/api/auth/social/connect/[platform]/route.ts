import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { buildMetaOAuthDialogUrl, getMetaOAuthScopeString, getMetaScopeProfile } from "@/utils/meta-oauth"

interface Params {
    params: Promise<{
        platform: string
    }>
}

export async function GET(request: Request, { params }: Params) {
    const { platform } = await params
    const normalizedPlatform = platform === 'instagram' ? 'instagram' : 'facebook'

    const clientId = process.env.FACEBOOK_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social/callback`
    const state = normalizedPlatform // store platform in state to know which one we are connecting

    if (!clientId) {
        return NextResponse.json({ error: "Missing FACEBOOK_CLIENT_ID" }, { status: 500 })
    }

    const profile = getMetaScopeProfile()
    const scopes = getMetaOAuthScopeString({ platform: normalizedPlatform, profile })

    console.warn('[AUTH_SOCIAL_CONNECT] Legacy OAuth route used. Prefer /api/auth/meta/login.', {
        platform: normalizedPlatform,
        profile,
        scopes: scopes.split(','),
    })

    const url = buildMetaOAuthDialogUrl({
        clientId,
        redirectUri,
        state,
        scope: scopes,
    })

    return redirect(url)
}
