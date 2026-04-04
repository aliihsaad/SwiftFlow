import { NextRequest, NextResponse } from 'next/server';
import { getMetaOAuthUrl, getMetaRedirectUri } from '@/utils/meta-oauth';
import { createClient } from '@/utils/supabase/server';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

const META_OAUTH_STATE_COOKIE = 'meta_oauth_state'
const META_OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 *
 * Uses shared Meta app credentials from environment variables.
 * Redirects to Facebook OAuth with a nonce in state and the workspace binding
 * stored server-side in an httpOnly cookie.
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'Missing workspaceId parameter' },
                { status: 400 }
            );
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await requireWorkspacePermission(supabase, user.id, workspaceId, 'integrations:write');

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

        const stateNonce = crypto.randomUUID()
        const statePayload = Buffer.from(JSON.stringify({
            nonce: stateNonce,
            workspaceId,
            createdAt: Date.now(),
        }), 'utf8').toString('base64url')

        // Generate OAuth URL with shared env credentials
        const authUrl = getMetaOAuthUrl(stateNonce);

        const response = NextResponse.redirect(authUrl);
        response.cookies.set(META_OAUTH_STATE_COOKIE, statePayload, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: META_OAUTH_STATE_MAX_AGE_SECONDS,
        })

        return response;
    } catch (error) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json(
                { error: error instanceof Error ? error.message : 'Forbidden' },
                { status: permissionStatus }
            );
        }
        console.error('[META_LOGIN] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
