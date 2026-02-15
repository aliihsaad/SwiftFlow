import { NextRequest, NextResponse } from 'next/server';
import { getMetaOAuthUrl, getMetaRedirectUri } from '@/utils/meta-oauth';

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 *
 * Uses shared Meta app credentials from environment variables.
 * Redirects to Facebook OAuth with workspaceId in state.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    if (!appId) {
        console.error('[META_LOGIN] Missing NEXT_PUBLIC_META_APP_ID env var');
        return NextResponse.redirect(
            new URL('/dashboard/settings/brand?error=meta_app_not_configured', request.url)
        );
    }

    console.log('[META_LOGIN] Using shared Meta app:', {
        workspaceId,
        appId: appId.substring(0, 8) + '...',
        redirectUri: getMetaRedirectUri()
    });

    // Generate OAuth URL with shared env credentials
    const authUrl = getMetaOAuthUrl(workspaceId);

    return NextResponse.redirect(authUrl);
}
