/**
 * Meta/Facebook OAuth Utilities
 * Handles OAuth redirect and token exchange for Facebook Pages integration
 */

const META_OAUTH_URL = 'https://www.facebook.com/v24.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v24.0/oauth/access_token';

/**
 * Generate Meta OAuth redirect URL
 * Redirects user to Facebook's OAuth dialog to authorize the app
 */
/**
 * Generate Meta OAuth redirect URL
 * Redirects user to Facebook's OAuth dialog to authorize the app
 * @param workspaceId Optional workspace ID to persist through the OAuth flow
 */
export function getMetaOAuthUrl(workspaceId?: string): string {
    const params: Record<string, string> = {
        client_id: process.env.NEXT_PUBLIC_META_APP_ID!,
        redirect_uri: getMetaRedirectUri(),
        response_type: 'code',
        scope: 'email,public_profile', // Step 1: Base login to establish trust
    };

    if (workspaceId) {
        params.state = workspaceId;
    }

    const queryParams = new URLSearchParams(params);

    return `${META_OAUTH_URL}?${queryParams.toString()}`;
}

/**
 * Get the correct redirect URI based on environment
 */
export function getMetaRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/auth/meta/callback`;
}

/**
 * Exchange authorization code for access token
 * Called server-side in the callback route
 */
export async function exchangeCodeForToken(code: string): Promise<{
    access_token: string;
    token_type: string;
    expires_in?: number;
}> {
    const params = new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_META_APP_ID!,
        client_secret: process.env.META_APP_SECRET!,
        redirect_uri: getMetaRedirectUri(),
        code,
    });

    const response = await fetch(`${META_TOKEN_URL}?${params.toString()}`, {
        method: 'GET',
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Meta token exchange failed: ${error}`);
    }

    return response.json();
}

/**
 * Frontend helper: Redirect user to Meta OAuth
 * Use this in a button click handler
 */
/**
 * Frontend helper: Redirect user to Meta OAuth
 * Use this in a button click handler
 */
export function redirectToMetaOAuth(workspaceId?: string): void {
    if (typeof window !== 'undefined') {
        window.location.href = getMetaOAuthUrl(workspaceId);
    }
}
