import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForToken } from '@/utils/meta-oauth';

/**
 * Meta OAuth Callback Route
 * Handles the redirect from Facebook after user authorizes the app
 * 
 * Flow:
 * 1. User authorizes app on Facebook
 * 2. Facebook redirects here with ?code=xxx
 * 3. Exchange code for access token
 * 4. Redirect to success page
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle OAuth errors (user denied, etc.)
    if (error) {
        console.error('Meta OAuth error:', error, errorDescription);
        return NextResponse.redirect(
            new URL(`/dashboard/settings?error=${encodeURIComponent(errorDescription || error)}`, request.url)
        );
    }

    // Validate authorization code
    if (!code) {
        return NextResponse.redirect(
            new URL('/dashboard/settings?error=missing_code', request.url)
        );
    }

    try {
        // Exchange code for access token
        const tokenData = await exchangeCodeForToken(code);

        console.log('Meta OAuth success:', {
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            has_token: !!tokenData.access_token,
        });

        // TODO: Store access_token in database
        // For now, just redirect to success page
        // In production, you'll want to:
        // 1. Get user info from Meta using the access token
        // 2. Store token in database linked to current user
        // 3. Fetch and store Facebook Pages

        return NextResponse.redirect(
            new URL('/dashboard/settings?success=meta_connected', request.url)
        );
    } catch (error) {
        console.error('Meta token exchange error:', error);

        const errorMessage = error instanceof Error
            ? error.message
            : 'Token exchange failed';

        return NextResponse.redirect(
            new URL(`/dashboard/settings?error=${encodeURIComponent(errorMessage)}`, request.url)
        );
    }
}
