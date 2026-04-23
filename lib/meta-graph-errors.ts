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
    platform?: 'instagram' | 'facebook' | string;
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
    if (ctx?.feature === 'messages') {
        if (ctx.platform === 'instagram') {
            // IG messaging is routed via Page messaging endpoints in this app.
            return ['instagram_manage_messages', 'pages_messaging'];
        }
        if (ctx.platform === 'facebook') {
            return ['pages_messaging'];
        }
        return ['pages_messaging'];
    }

    if (ctx?.feature === 'comments') {
        if (ctx.platform === 'instagram') {
            return ['instagram_manage_comments'];
        }
        if (ctx.platform === 'facebook') {
            if (ctx.operation === 'fetch_comments') {
                return ['pages_read_engagement'];
            }
            if (ctx.operation === 'reply_comment' || ctx.operation === 'hide_comment' || ctx.operation === 'unhide_comment') {
                return ['pages_manage_engagement'];
            }
            return ['pages_read_engagement', 'pages_manage_engagement'];
        }
        return ['instagram_manage_comments'];
    }

    if (ctx?.feature === 'analytics') {
        if (ctx.platform === 'instagram') {
            return ['instagram_manage_insights'];
        }
        if (ctx.platform === 'facebook') {
            return ['pages_read_engagement'];
        }
        return ['instagram_manage_insights', 'pages_read_engagement'];
    }

    if (ctx?.feature === 'posts') {
        if (ctx.platform === 'facebook') {
            if (ctx.operation === 'fetch_posts') {
                return ['pages_read_engagement'];
            }
            if (ctx.operation === 'update_post' || ctx.operation === 'delete_post') {
                return ['pages_manage_posts'];
            }
            return ['pages_read_engagement', 'pages_manage_posts'];
        }
        return ['instagram_basic'];
    }

    return [];
}

function buildPermissionMessage(ctx?: MetaErrorContext, missingPermissions: string[] = []): string {
    const permissionList = missingPermissions.length > 0 ? missingPermissions.join(', ') : 'required messaging permissions';
    if (ctx?.feature === 'messages') {
        if (ctx.platform === 'facebook') {
            const base = ctx.operation === 'send_message'
                ? `Facebook message sending is not enabled for this account. Reconnect with ${permissionList}.`
                : `Facebook messaging is not enabled for this account. Reconnect with ${permissionList}.`;
            return `${base} If Access Token Debugger already shows pages_messaging, check App Review/Advanced Access, app mode (Development vs Live), app role/tester access, and Page webhook/subscribed apps setup.`;
        }
        if (ctx.operation === 'send_message') {
            return `Messaging send is not enabled for this account. Reconnect with ${permissionList}.`;
        }
        return `Messaging is not enabled for this account. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'comments') {
        if (ctx.operation === 'reply_comment') {
            return `Comment replies are not enabled for this account. Reconnect with ${permissionList}.`;
        }
        if (ctx.operation === 'hide_comment' || ctx.operation === 'unhide_comment') {
            return `Comment moderation is not enabled for this account. Reconnect with ${permissionList}.`;
        }
        return `Comment access is not enabled for this account. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'analytics') {
        return `Analytics sync is limited or unavailable. Reconnect with ${permissionList}.`;
    }
    if (ctx?.feature === 'posts') {
        if (ctx.operation === 'fetch_posts') {
            return `Facebook Page posts are not available for this connected account. Reconnect with ${permissionList}.`;
        }
        if (ctx.operation === 'update_post') {
            return `Facebook post editing is not available for this connected account. Reconnect with ${permissionList}.`;
        }
        if (ctx.operation === 'delete_post') {
            return `Facebook post deletion is not available for this connected account. Reconnect with ${permissionList}.`;
        }
        return `Post access is not available for this connected account. Reconnect with ${permissionList}.`;
    }
    return `This action requires additional Meta permissions: ${permissionList}.`;
}

export function normalizeMetaGraphError(
    graphError: MetaGraphErrorShape | null | undefined,
    ctx?: MetaErrorContext
): NormalizedMetaGraphError {
    const message = String(
        graphError?.error_user_msg ||
        graphError?.message ||
        'Meta Graph API request failed'
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
        /permission|requires permission|not authorized|appropriate role|pages_messaging|instagram_manage_messages/.test(lower);

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
            message: 'Meta access token is invalid or expired. Reconnect your account in Settings.',
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
            message: 'Meta API rate limit reached. Please try again shortly.',
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
