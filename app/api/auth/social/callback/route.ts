import { createClient } from "@/utils/supabase/server"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from "@/lib/workspace-permissions"

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const platform = searchParams.get('state') || 'facebook' // 'facebook' or 'instagram' passed via state
    const error = searchParams.get('error')

    if (error) {
        return redirect(`/dashboard/settings?error=${error}`)
    }

    if (!code) {
        return redirect(`/dashboard/settings?error=no_code`)
    }

    const clientId = process.env.FACEBOOK_CLIENT_ID
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social/callback`

    if (!clientId || !clientSecret) {
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })
    }

    try {
        // 1. Exchange code for short-lived token
        const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${clientId}&redirect_uri=${redirectUri}&client_secret=${clientSecret}&code=${code}`
        const tokenRes = await fetch(tokenUrl)
        const tokenData = await tokenRes.json()

        if (tokenData.error) {
            throw new Error(tokenData.error.message)
        }

        const shortLivedToken = tokenData.access_token

        // 2. Exchange for long-lived token (60 days)
        const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${clientId}&client_secret=${clientSecret}&fb_exchange_token=${shortLivedToken}`
        const longLivedRes = await fetch(longLivedUrl)
        const longLivedData = await longLivedRes.json()

        const accessToken = longLivedData.access_token || shortLivedToken
        const expiresIn = longLivedData.expires_in // seconds

        // 3. Get User ID and Name
        const meUrl = `https://graph.facebook.com/me?access_token=${accessToken}&fields=id,name`
        const meRes = await fetch(meUrl)
        const meData = await meRes.json()

        if (meData.error) {
            throw new Error(meData.error.message)
        }

        // 3b. Fetch Facebook Pages if platform is facebook
        let metadata = {}
        if (platform === 'facebook') {
            const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}&fields=id,name,access_token,picture`
            const pagesRes = await fetch(pagesUrl)
            const pagesData = await pagesRes.json()

            if (pagesData.data) {
                metadata = {
                    pages: pagesData.data.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        picture: p.picture?.data?.url,
                        access_token: p.access_token, // Page Access Token
                        selected: false // Default to false
                    }))
                }
            }
        }

        // 4. Save to Supabase
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return redirect(`/login?next=${encodeURIComponent('/dashboard/settings')}`)
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return redirect(`/dashboard/onboarding`)
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'integrations:write')

        // Ensure workspace exists (create default if not)
        // In real app, user should already have workspace. For now get first or create.
        let workspace: { id: string } | null = { id: activeWorkspace.id }

        if (!workspace && user) {
            const { data: newWs } = await supabase.from('workspaces').insert({
                user_id: user.id,
                name: "My Workspace"
            }).select().single()
            workspace = newWs
        }

        if (workspace) {
            await supabase.from('social_accounts').upsert({
                workspace_id: workspace.id,
                platform: platform,
                platform_user_id: meData.id,
                platform_username: meData.name,
                access_token: accessToken,
                token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
                is_active: true,
                metadata: metadata
            }, { onConflict: 'workspace_id, platform, platform_user_id' })
        }

        return redirect(`/dashboard/settings?success=connected_${platform}`)

    } catch (err: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(err)
        if (permissionStatus) {
            return redirect(`/dashboard/settings?error=forbidden`)
        }
        console.error("OAuth Error:", err)
        return redirect(`/dashboard/settings?error=${encodeURIComponent(err.message)}`)
    }
}
