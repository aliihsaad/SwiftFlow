import { NextRequest, NextResponse } from 'next/server';
import { getMetaOAuthUrl } from '@/utils/meta-oauth';

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 * 
 * Redirects the user to Facebook's OAuth dialog.
 * Uses only base scopes (email, public_profile).
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

    const authUrl = getMetaOAuthUrl(workspaceId);
    return NextResponse.redirect(authUrl);
}
