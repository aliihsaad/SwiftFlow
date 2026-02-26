import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { buildMetaOAuthDialogUrl, getMetaOAuthScopeString, getMetaScopeProfile } from "@/utils/meta-oauth"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"

interface Params {
    params: Promise<{
        platform: string
    }>
}

export async function GET(request: Request, { params }: Params) {
    try {
        const { platform } = await params
        const normalizedPlatform = platform === 'instagram' ? 'instagram' : 'facebook'

        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: "No active workspace" }, { status: 404 })
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'integrations:write')

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
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error)
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            )
        }
        console.error('[AUTH_SOCIAL_CONNECT] Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
