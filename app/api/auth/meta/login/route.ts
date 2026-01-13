import { NextRequest, NextResponse } from 'next/server';
import { getMetaOAuthUrl } from '@/utils/meta-oauth';

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 * 
 * Redirects the user to Facebook's OAuth dialog.
 * Supports two flow types:
 * - 'login': Basic authentication (email, public_profile)
 * - 'pages': Full page access (includes page permissions)
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');
    const flowType = (searchParams.get('flow') || 'pages') as 'login' | 'pages';

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    const authUrl = getMetaOAuthUrl(workspaceId, flowType);
    return NextResponse.redirect(authUrl);
}
