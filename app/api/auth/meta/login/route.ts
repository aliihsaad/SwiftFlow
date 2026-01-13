import { NextRequest, NextResponse } from 'next/server';
import { getMetaOAuthUrl } from '@/utils/meta-oauth';

/**
 * Meta OAuth Login Route
 * /api/auth/meta/login
 * 
 * Redirects the user to Facebook's OAuth dialog.
 * Can be called directly or via a link.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const workspaceId = searchParams.get('workspaceId');
    const scope = searchParams.get('scope');

    if (!workspaceId) {
        return NextResponse.json(
            { error: 'Missing workspaceId parameter' },
            { status: 400 }
        );
    }

    const authUrl = getMetaOAuthUrl(workspaceId, scope || undefined);
    return NextResponse.redirect(authUrl);
}
