/**
 * Meta/Facebook OAuth Utilities
 * Supports per-workspace Meta app credentials to bypass app review
 */

const META_OAUTH_URL = 'https://www.facebook.com/v24.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v24.0/oauth/access_token';

/**
 * OAuth Scopes required for full functionality
 * - pages_show_list, pages_read_engagement, pages_manage_posts: Facebook page management
 * - instagram_basic, instagram_content_publish: Instagram posting
 * - instagram_manage_insights, instagram_manage_comments, instagram_manage_messages: Instagram engagement
 */
export const META_SCOPE = 'public_profile,pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,instagram_manage_insights,instagram_manage_comments,instagram_manage_messages';

/**
 * Get the correct redirect URI based on environment
 */
export function getMetaRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/auth/meta/callback`;
}

/**
 * Generate Meta OAuth URL with workspace-specific credentials
 * @param appId - The Meta App ID (from workspace settings)
 * @param workspaceId - Workspace ID to pass in state
 */
export function getMetaOAuthUrlWithCredentials(appId: string, workspaceId: string): string {
    console.log('[META_OAUTH] Generating OAuth URL with workspace credentials', {
        appId: appId?.substring(0, 8) + '...',
        workspaceId,
    });

    const redirectUri = getMetaRedirectUri();

    const params: Record<string, string> = {
        client_id: appId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: META_SCOPE,
        return_scopes: 'true',
        state: workspaceId,
    };

    const queryParams = new URLSearchParams(params);
    const finalUrl = `${META_OAUTH_URL}?${queryParams.toString()}`;
    console.log('[META_OAUTH] Final URL:', finalUrl.substring(0, 100) + '...');

    return finalUrl;
}

/**
 * Exchange authorization code for access token using workspace credentials
 * @param code - Authorization code from OAuth callback
 * @param appId - Meta App ID
 * @param appSecret - Meta App Secret
 */
export async function exchangeCodeForTokenWithCredentials(
    code: string,
    appId: string,
    appSecret: string
): Promise<{
    access_token: string;
    token_type: string;
    expires_in?: number;
    scope?: string;
}> {
    const params = new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
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

// ============================================
// Legacy functions (for backwards compatibility)
// These use environment variables as fallback
// ============================================

/**
 * @deprecated Use getMetaOAuthUrlWithCredentials instead
 * Generate Meta OAuth URL using environment variables
 */
export function getMetaOAuthUrl(workspaceId?: string): string {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    console.log('[META_OAUTH] Generating OAuth URL (legacy)', {
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
 * @deprecated Use exchangeCodeForTokenWithCredentials instead
 * Exchange code using environment variables
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
 * Note: This redirects to an API route that handles credential lookup
 */
export function redirectToMetaOAuth(workspaceId?: string): void {
    if (typeof window !== 'undefined') {
        // Redirect to API route which will look up workspace credentials
        window.location.href = `/api/auth/meta/login?workspaceId=${workspaceId}`;
    }
}
