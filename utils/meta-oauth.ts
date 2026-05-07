import { META_GRAPH_API_BASE_URL, META_GRAPH_API_VERSION, META_OAUTH_DIALOG_BASE_URL } from "@/lib/meta-graph-version"

/**
 * Meta/Facebook OAuth Utilities
 * Uses shared Meta app credentials from environment variables.
 *
 * This file is the single source of truth for Meta OAuth scopes.
 * Use scope profiles to keep App Review submissions narrow and deterministic.
 */

export const META_OAUTH_VERSION = META_GRAPH_API_VERSION;
export const META_OAUTH_URL = META_OAUTH_DIALOG_BASE_URL;
const META_TOKEN_URL = `${META_GRAPH_API_BASE_URL}/oauth/access_token`;

export type MetaOAuthScopeProfile = 'full' | 'review_phase_1';
export type MetaOAuthPlatform = 'all' | 'facebook' | 'instagram';

const VALID_KNOWN_SCOPES = new Set([
    'public_profile',
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_manage_engagement',
    'pages_messaging',
    'business_management',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'instagram_manage_comments',
    'instagram_manage_messages',
]);

const BLOCKED_LEGACY_SCOPES = new Set([
    'pages_read_user_content',
    'read_insights',
]);

const COMMON_SCOPES = ['public_profile'] as const;
const FACEBOOK_SCOPES = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_manage_engagement',
    'business_management',
] as const;
const INSTAGRAM_SCOPES = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'instagram_manage_comments',
    'instagram_manage_messages',
] as const;

const REVIEW_PHASE_1_SCOPES = [
    ...COMMON_SCOPES,
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
] as const;

const FULL_SCOPES = [
    ...COMMON_SCOPES,
    ...FACEBOOK_SCOPES,
    ...INSTAGRAM_SCOPES,
] as const;

const PROFILE_SCOPES: Record<MetaOAuthScopeProfile, readonly string[]> = {
    full: FULL_SCOPES,
    review_phase_1: REVIEW_PHASE_1_SCOPES,
};

function parseCsvScopes(value?: string | null): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function sanitizeAdditionalScopes(scopes: string[]): string[] {
    const blocked = scopes.filter((scope) => BLOCKED_LEGACY_SCOPES.has(scope));
    if (blocked.length > 0) {
        console.warn('[META_OAUTH] Ignoring blocked legacy scopes from configuration:', blocked);
    }

    const unknown = scopes.filter((scope) => !BLOCKED_LEGACY_SCOPES.has(scope) && !VALID_KNOWN_SCOPES.has(scope));
    if (unknown.length > 0) {
        console.warn('[META_OAUTH] Ignoring unknown scopes from configuration:', unknown);
    }

    return scopes.filter((scope) => VALID_KNOWN_SCOPES.has(scope) && !BLOCKED_LEGACY_SCOPES.has(scope));
}

function sanitizeOutgoingScopes(scopes: string[]): string[] {
    const sanitized = sanitizeAdditionalScopes(scopes);
    if (sanitized.length > 0) return sanitized;
    return [...COMMON_SCOPES];
}

export function getMetaScopeProfile(): MetaOAuthScopeProfile {
    const raw = (process.env.META_OAUTH_SCOPE_PROFILE || 'review_phase_1').trim();
    if (raw === 'review_phase_1') return raw;
    return 'full';
}

function filterScopesByPlatform(scopes: string[], platform: MetaOAuthPlatform): string[] {
    if (platform === 'all') return scopes;
    if (platform === 'facebook') {
        return scopes.filter((scope) => !scope.startsWith('instagram_'));
    }
    // Instagram OAuth still needs page scopes for page selection / linked account access.
    if (platform === 'instagram') {
        return scopes.filter((scope) => scope === 'public_profile' || scope.startsWith('instagram_') || scope.startsWith('pages_'));
    }
    return scopes;
}

export function getMetaOAuthScopes(options?: {
    profile?: MetaOAuthScopeProfile;
    platform?: MetaOAuthPlatform;
    includePagesMessaging?: boolean;
}): string[] {
    const profile = options?.profile || getMetaScopeProfile();
    const platform = options?.platform || 'all';
    const requestedPagesMessaging = options?.includePagesMessaging
        ?? String(process.env.META_OAUTH_INCLUDE_PAGES_MESSAGING || '').toLowerCase() === 'true';
    const includePagesMessaging = profile !== 'review_phase_1' && requestedPagesMessaging;

    const baseScopes = [...(PROFILE_SCOPES[profile] || PROFILE_SCOPES.full)];
    const extraScopes = sanitizeAdditionalScopes(parseCsvScopes(process.env.META_OAUTH_EXTRA_SCOPES))
        .filter((scope) => profile !== 'review_phase_1' || REVIEW_PHASE_1_SCOPES.includes(scope as typeof REVIEW_PHASE_1_SCOPES[number]));
    if (includePagesMessaging) {
        extraScopes.push('pages_messaging');
    }

    const deduped = Array.from(new Set([...baseScopes, ...extraScopes]));
    return filterScopesByPlatform(deduped, platform);
}

export function getMetaOAuthScopeString(options?: {
    profile?: MetaOAuthScopeProfile;
    platform?: MetaOAuthPlatform;
    includePagesMessaging?: boolean;
}): string {
    return getMetaOAuthScopes(options).join(',');
}

/**
 * Backward-compatible export for older call sites.
 * Represents the default profile scope string for the current environment.
 */
export const META_SCOPE = getMetaOAuthScopeString();

/**
 * Get the correct redirect URI based on environment
 */
export function getMetaRedirectUri(): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/auth/meta/callback`;
}

export function buildMetaOAuthDialogUrl(params: {
    clientId: string;
    redirectUri: string;
    state?: string;
    scope?: string;
    authType?: 'rerequest';
}): string {
    const requestedScopes = params.scope ? parseCsvScopes(params.scope) : getMetaOAuthScopes();
    const scope = sanitizeOutgoingScopes(requestedScopes).join(',');
    const queryParams = new URLSearchParams({
        client_id: params.clientId,
        redirect_uri: params.redirectUri,
        response_type: 'code',
        scope,
        return_scopes: 'true',
    });

    if (params.state) {
        queryParams.set('state', params.state);
    }
    if (params.authType) {
        queryParams.set('auth_type', params.authType);
    }

    return `${META_OAUTH_URL}?${queryParams.toString()}`;
}

/**
 * Generate Meta OAuth URL using environment variables
 */
export function getMetaOAuthUrl(state?: string): string {
    const appId = process.env.NEXT_PUBLIC_META_APP_ID;
    const profile = getMetaScopeProfile();
    const scope = getMetaOAuthScopeString({ profile });

    console.log('[META_OAUTH] Generating OAuth URL', {
        appId: appId,
        appIdType: typeof appId,
        hasState: !!state,
        profile,
        scopes: scope.split(','),
    });

    if (!appId) {
        console.error('[META_OAUTH] Missing NEXT_PUBLIC_META_APP_ID');
    }

    const finalUrl = buildMetaOAuthDialogUrl({
        clientId: appId || '',
        redirectUri: getMetaRedirectUri(),
        state: state || undefined,
        scope,
        authType: 'rerequest',
    });
    console.log('[META_OAUTH] Final URL:', finalUrl);

    return finalUrl;
}

/**
 * Exchange authorization code for access token
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
        window.location.href = `/api/auth/meta/login?workspaceId=${workspaceId}`;
    }
}
