import { redirect } from "next/navigation"
import { NextResponse } from "next/server"

// Meta scopes needed for posting
const FB_SCOPES = [
    'public_profile',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts'
].join(',')

const IG_SCOPES = [
    'public_profile',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'instagram_manage_messages',
    'pages_show_list',
    'pages_read_engagement'
].join(',')

interface Params {
    params: Promise<{
        platform: string
    }>
}

export async function GET(request: Request, { params }: Params) {
    const { platform } = await params

    const clientId = process.env.FACEBOOK_CLIENT_ID
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/social/callback`
    const state = platform // store platform in state to know which one we are connecting

    if (!clientId) {
        return NextResponse.json({ error: "Missing FACEBOOK_CLIENT_ID" }, { status: 500 })
    }

    let scopes = FB_SCOPES
    if (platform === 'instagram') {
        scopes = IG_SCOPES
    }

    const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}&response_type=code`

    return redirect(url)
}
