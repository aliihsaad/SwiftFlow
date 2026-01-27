/**
 * Meta/Facebook OAuth Utilities
 * Modern two-step flow: Login (auth) vs Pages (business assets)
 */

const META_OAUTH_URL = 'https://www.facebook.com/v24.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v24.0/oauth/access_token';

/**
 * OAuth Scopes
 * We use ONLY base scopes - page access is implicit for page admins via /me/accounts
 */
export const META_SCOPE = 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish';

/**
 * Generate Meta OAuth URL
 * Uses only base scopes - page access is implicit for admins
 */
export function getMetaOAuthUrl(workspaceId?: string): string {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    console.log('[META_OAUTH] Generating OAuth URL', {
        appId: appId,
        appIdType: typeof appId,
        hasWorkspaceId: !!workspaceId,
    });

    if (!appId) {
        console.error('[META_OAUTH] Missing NEXT_PUBLIC_META_APP_ID');
    }

    const redirectUri = getMetaRedirectUri();

    const params: Record<string, string> = {
        client_id: appId || '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: META_SCOPE,
        // Force complete reauthorization including asset selection
        auth_type: 'reauthorize',
        // Enable profile/page selector  
        enable_profile_selector: 'true',
        // Return granted scopes in callback for debugging
        return_scopes: 'true',
    };

    if (workspaceId) {
        params.state = workspaceId;
    }

    const queryParams = new URLSearchParams(params);
    const finalUrl = `${META_OAUTH_URL}?${queryParams.toString()}`;
    console.log('[META_OAUTH] Final URL:', finalUrl);

    return finalUrl;
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
    scope?: string;
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
 */
export function redirectToMetaOAuth(workspaceId?: string): void {
    if (typeof window !== 'undefined') {
        window.location.href = getMetaOAuthUrl(workspaceId);
    }
}
