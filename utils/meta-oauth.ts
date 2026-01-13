/**
 * Meta/Facebook OAuth Utilities
 * Modern two-step flow: Login (auth) vs Pages (business assets)
 */

const META_OAUTH_URL = 'https://www.facebook.com/v24.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v24.0/oauth/access_token';

/**
 * OAuth Scopes for different flows
 * Meta's modern pattern: Separate login from business asset access
 */
export const META_LOGIN_SCOPE = 'email,public_profile';

export const META_PAGES_PERMISSIONS = [
    'pages_read_engagement',    // Read page data
    'pages_manage_posts',       // Create/manage posts
    'pages_manage_metadata',    // Page settings
    'instagram_basic',          // Instagram account info
    'instagram_content_publish' // Post to Instagram
].join(',');

// Combined for page connection flow
export const META_FULL_SCOPE = `${META_LOGIN_SCOPE},${META_PAGES_PERMISSIONS}`;

/**
 * Generate Meta OAuth URL
 * @param workspaceId - Workspace to connect (optional)
 * @param flowType - 'login' for authentication, 'pages' for page access
 */
export function getMetaOAuthUrl(
    workspaceId?: string,
    flowType: 'login' | 'pages' = 'login'
): string {
    console.log('[META_OAUTH] Generating OAuth URL', {
        flowType,
        hasAppId: !!process.env.NEXT_PUBLIC_META_APP_ID,
        hasWorkspaceId: !!workspaceId,
    });

    const redirectUri = getMetaRedirectUri();

    // Choose scope based on flow type
    const scope = flowType === 'pages' ? META_FULL_SCOPE : META_LOGIN_SCOPE;

    const params: Record<string, string> = {
        client_id: process.env.NEXT_PUBLIC_META_APP_ID!,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope,
    };

    // Encode flow type in state parameter: "workspaceId:flowType"
    const state = workspaceId
        ? `${workspaceId}:${flowType}`
        : flowType;

    params.state = state;

    const queryParams = new URLSearchParams(params);
    const fullUrl = `${META_OAUTH_URL}?${queryParams.toString()}`;

    console.log('[META_OAUTH] OAuth URL generated', {
        flowType,
        scope: flowType === 'pages' ? '[pages permissions]' : scope,
        redirectUri,
    });

    return fullUrl;
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
 * @param workspaceId - Workspace ID
 * @param flowType - 'login' or 'pages'
 */
export function redirectToMetaOAuth(
    workspaceId?: string,
    flowType: 'login' | 'pages' = 'login'
): void {
    if (typeof window !== 'undefined') {
        window.location.href = getMetaOAuthUrl(workspaceId, flowType);
    }
}
