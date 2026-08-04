export interface MetaGraphErrorShape {
    message?: string;
    code?: number;
    error_subcode?: number;
    type?: string;
    fbtrace_id?: string;
    error_user_title?: string;
    error_user_msg?: string;
}

export interface MetaErrorContext {
    feature?: 'messages' | 'comments' | 'analytics' | 'posts' | 'generic';
    platform?: 'instagram';
    operation?: string;
}

export interface NormalizedMetaGraphError {
    code: 'meta_missing_permission' | 'meta_auth_invalid_token' | 'meta_rate_limited' | 'meta_api_error';
    httpStatus: number;
    message: string;
    category: 'permission' | 'auth' | 'rate_limit' | 'api';
    missingPermissions: string[];
    requiresReconnect: boolean;
    meta: {
        graphCode?: number;
        graphSubcode?: number;
        type?: string;
        fbtraceId?: string;
    };
}

function inferMissingPermissions(ctx?: MetaErrorContext): string[] {
    switch (ctx?.feature) {
        case 'messages':
            return ['instagram_business_manage_messages'];
        case 'comments':
            return ['instagram_business_manage_comments'];
        case 'analytics':
            return ['instagram_business_manage_insights'];
        case 'posts':
            return ['instagram_business_basic'];
        default:
            return [];
    }
}

function buildPermissionMessage(ctx?: MetaErrorContext, missingPermissions: string[] = []): string {
    const permissionList = missingPermissions.length > 0
        ? missingPermissions.join(', ')
        : 'additional Instagram permissions';

    if (ctx?.feature === 'messages') {
        return ctx.operation === 'send_message'
            ? `Instagram message sending is not enabled. Reconnect with ${permissionList}.`
            : `Instagram messaging is not enabled. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'comments') {
        if (ctx.operation === 'reply_comment') {
            return `Instagram comment replies are not enabled. Reconnect with ${permissionList}.`;
        }
        if (ctx.operation === 'hide_comment' || ctx.operation === 'unhide_comment') {
            return `Instagram comment moderation is not enabled. Reconnect with ${permissionList}.`;
        }
        return `Instagram comment access is not enabled. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'analytics') {
        return `Instagram analytics sync is limited or unavailable. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'posts') {
        return `Instagram media access is not available. Reconnect with ${permissionList}.`;
    }
    return `This action requires additional Instagram permissions: ${permissionList}.`;
}

export function normalizeMetaGraphError(
    graphError: MetaGraphErrorShape | null | undefined,
    ctx?: MetaErrorContext,
): NormalizedMetaGraphError {
    const message = String(
        graphError?.error_user_msg ||
        graphError?.message ||
        'Instagram Graph API request failed',
    );
    const lower = message.toLowerCase();
    const code = Number(graphError?.code || 0);
    const subcode = Number(graphError?.error_subcode || 0);

    const meta = {
        graphCode: Number.isFinite(code) && code > 0 ? code : undefined,
        graphSubcode: Number.isFinite(subcode) && subcode > 0 ? subcode : undefined,
        type: graphError?.type,
        fbtraceId: graphError?.fbtrace_id,
    };

    const isPermissionError =
        code === 10 ||
        code === 200 ||
        /permission|requires permission|not authorized|appropriate role|instagram_business_(basic|manage_comments|manage_messages|manage_insights)/.test(lower);

    if (isPermissionError) {
        const missingPermissions = inferMissingPermissions(ctx);
        return {
            code: 'meta_missing_permission',
            httpStatus: 403,
            message: buildPermissionMessage(ctx, missingPermissions),
            category: 'permission',
            missingPermissions,
            requiresReconnect: true,
            meta,
        };
    }

    const isAuthError =
        code === 190 ||
        /invalid oauth|access token|token has expired|session has expired|invalid token/.test(lower);

    if (isAuthError) {
        return {
            code: 'meta_auth_invalid_token',
            httpStatus: 401,
            message: 'Instagram access token is invalid or expired. Reconnect Instagram in Settings.',
            category: 'auth',
            missingPermissions: [],
            requiresReconnect: true,
            meta,
        };
    }

    const isRateLimited = code === 4 || /rate limit|application request limit/.test(lower);
    if (isRateLimited) {
        return {
            code: 'meta_rate_limited',
            httpStatus: 429,
            message: 'Instagram API rate limit reached. Please try again shortly.',
            category: 'rate_limit',
            missingPermissions: [],
            requiresReconnect: false,
            meta,
        };
    }

    return {
        code: 'meta_api_error',
        httpStatus: 502,
        message,
        category: 'api',
        missingPermissions: [],
        requiresReconnect: false,
        meta,
    };
}
