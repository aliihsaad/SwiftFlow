import { NextRequest, NextResponse } from 'next/server';
import { canManageCommentsWithMetaAccount, canReadCommentsWithMetaAccount, decryptMetaAccountRow } from '@/lib/meta-account';
import { META_GRAPH_API_BASE_URL } from '@/lib/meta-graph-version';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError, type MetaGraphErrorShape } from '@/lib/meta-graph-errors';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation';

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

type CommentData = {
    id: string;
    platform_comment_id: string;
    author_username: string;
    message: string;
    timestamp: string;
    is_hidden: boolean;
    replies: CommentData[];
};

type InstagramCommentApiItem = {
    id: string;
    text?: string;
    timestamp?: string;
    username?: string;
    hidden?: boolean;
    from?: {
        username?: string;
    };
    replies?: {
        data?: InstagramCommentApiItem[];
    };
};

type FacebookCommentApiItem = {
    id: string;
    message?: string;
    created_time?: string;
    is_hidden?: boolean;
    from?: {
        name?: string;
    };
    comments?: {
        data?: FacebookCommentApiItem[];
    };
};

type CommentsApiResponse<T> = {
    data?: T[];
    error?: MetaGraphErrorShape;
};

type CommentActionApiResponse = {
    id?: string;
    success?: boolean;
    error?: MetaGraphErrorShape;
};

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
}

function requiredCommentPermissions(platform: string, mode: 'read' | 'manage'): string[] {
    if (platform === 'facebook') {
        return [mode === 'manage' ? 'pages_manage_engagement' : 'pages_read_engagement'];
    }

    return ['instagram_manage_comments'];
}

function metaErrorResponse(
    graphError: MetaGraphErrorShape | null | undefined,
    ctx: { platform: string; operation: 'fetch_comments' | 'reply_comment' | 'hide_comment' | 'unhide_comment' }
) {
    const normalized = normalizeMetaGraphError(graphError, {
        feature: 'comments',
        platform: ctx.platform,
        operation: ctx.operation,
    });

    return NextResponse.json(
        {
            error: normalized.message,
            errorCode: normalized.code,
            missingPermissions: normalized.missingPermissions,
            requiresReconnect: normalized.requiresReconnect,
            meta: normalized.meta,
        },
        { status: normalized.httpStatus }
    );
}

function commentCapabilityErrorResponse(platform: string, mode: 'read' | 'manage') {
    const isInstagramPhase2Read = platform === 'instagram' && mode === 'read';

    return NextResponse.json(
        {
            error: isInstagramPhase2Read
                ? 'Instagram comments require instagram_manage_comments, which is reserved for Phase 2.'
                : mode === 'read'
                ? 'Comment access is not available for this connected account'
                : 'Comment management is not available for this connected account',
            errorCode: 'meta_missing_permission',
            missingPermissions: requiredCommentPermissions(platform, mode),
            requiresReconnect: false,
            meta: null,
        },
        { status: 403 }
    );
}

// GET - Fetch comments for a specific post live from Meta API
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // Auth check
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get active workspace
        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const { searchParams } = new URL(request.url);
        const rawPostId = searchParams.get('postId'); // platform_post_id (media ID or post ID)
        const platform = searchParams.get('platform') || 'instagram';

        if (!rawPostId) {
            return NextResponse.json({ error: 'postId is required' }, { status: 400 });
        }
        const postId = assertMetaGraphNodeId(rawPostId, 'postId')

        // Get the social account for this platform
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (accountError || !account) {
            return NextResponse.json(
                { error: `No ${platform} account connected` },
                { status: 404 }
            );
        }
        const decryptedAccount = decryptMetaAccountRow(account);

        if (!decryptedAccount.access_token) {
            return NextResponse.json(
                { error: 'No access token available' },
                { status: 400 }
            );
        }

        if (!canReadCommentsWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return commentCapabilityErrorResponse(platform, 'read');
        }

        let comments: CommentData[] = [];

        if (platform === 'instagram') {
            // Instagram: GET /{media-id}/comments
            const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}&access_token=${decryptedAccount.access_token}`;

            console.log(`[PostComments] Fetching Instagram comments for ${postId}`);
            const response = await fetch(url);
            const data = await response.json() as CommentsApiResponse<InstagramCommentApiItem>;

            if (!response.ok) {
                console.error('[PostComments] Instagram API error:', data.error);
                return metaErrorResponse(data?.error, { platform, operation: 'fetch_comments' });
            }

            comments = (data.data || []).map((c) => ({
                id: c.id,
                platform_comment_id: c.id,
                author_username: c.from?.username || c.username || 'Unknown',
                message: c.text || '',
                timestamp: c.timestamp || '',
                is_hidden: !!c.hidden,
                replies: (c.replies?.data || []).map((r) => ({
                    id: r.id,
                    platform_comment_id: r.id,
                    author_username: r.from?.username || r.username || 'Unknown',
                    message: r.text || '',
                    timestamp: r.timestamp || '',
                    is_hidden: !!r.hidden,
                    replies: [],
                })),
            }));

        } else if (platform === 'facebook') {
            // Facebook: GET /{post-id}/comments
            const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,message,created_time,is_hidden,from{id,name},comments{id,message,created_time,is_hidden,from{id,name}}&access_token=${decryptedAccount.access_token}`;

            console.log(`[PostComments] Fetching Facebook comments for ${postId}`);
            const response = await fetch(url);
            const data = await response.json() as CommentsApiResponse<FacebookCommentApiItem>;

            if (!response.ok) {
                console.error('[PostComments] Facebook API error:', data.error);
                return metaErrorResponse(data?.error, { platform, operation: 'fetch_comments' });
            }

            comments = (data.data || [])
                .map((c) => ({
                    id: c.id,
                    platform_comment_id: c.id,
                    author_username: c.from?.name || 'Unknown',
                    message: c.message || '',
                    timestamp: c.created_time || '',
                    is_hidden: !!c.is_hidden,
                    replies: (c.comments?.data || [])
                        .map((r) => ({
                            id: r.id,
                            platform_comment_id: r.id,
                            author_username: r.from?.name || 'Unknown',
                            message: r.message || '',
                            timestamp: r.created_time || '',
                            is_hidden: !!r.is_hidden,
                            replies: [],
                        })),
                }));
        }

        return NextResponse.json({
            comments,
            account: {
                id: decryptedAccount.id,
                account_name: decryptedAccount.account_name,
                platform: decryptedAccount.platform,
            },
            workspaceId: activeWorkspace.id,
        });

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid postId/i.test(error.message)) {
            return NextResponse.json(
                { error: error.message },
                { status: 400 }
            );
        }
        console.error('Post comments API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to fetch comments') },
            { status: 500 }
        );
    }
}

// POST - Reply to a comment (reuses existing logic from /api/comments)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        assertJsonBodySize(request, 64 * 1024);
        const body = await request.json();
        const rawCommentId = body?.commentId;
        const message = typeof body?.message === 'string' ? body.message.trim() : '';
        const platform = body?.platform;

        if (!rawCommentId || !message || !platform) {
            return NextResponse.json(
                { error: 'commentId, message, and platform are required' },
                { status: 400 }
            );
        }
        const commentId = assertMetaGraphNodeId(rawCommentId, 'commentId')

        // Get the social account
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        if (!canManageCommentsWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return commentCapabilityErrorResponse(platform, 'manage');
        }

        // Post reply via Meta API
        let replyUrl: string;
        if (platform === 'instagram') {
            replyUrl = `${META_GRAPH_URL}/${commentId}/replies`;
        } else {
            replyUrl = `${META_GRAPH_URL}/${commentId}/comments`;
        }

        const response = await fetch(replyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                access_token: decryptedAccount.access_token,
            }),
        });

        const result = await response.json() as CommentActionApiResponse;

        if (!response.ok) {
            console.error('[PostComments] Reply API error:', result?.error);
            return metaErrorResponse(result?.error, { platform, operation: 'reply_comment' });
        }

        return NextResponse.json({
            success: true,
            replyId: result.id,
        });

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid commentId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage(error, 'Forbidden') }, { status: permissionStatus });
        }
        console.error('Reply to comment API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to reply to comment') },
            { status: 500 }
        );
    }
}

// DELETE - Hide a comment
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        const { searchParams } = new URL(request.url);
        const rawCommentId = searchParams.get('commentId');
        const platform = searchParams.get('platform') || 'instagram';

        if (!rawCommentId) {
            return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
        }
        const commentId = assertMetaGraphNodeId(rawCommentId, 'commentId')

        // Get the social account
        const { data: account } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (!decryptedAccount?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        if (!canManageCommentsWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return commentCapabilityErrorResponse(platform, 'manage');
        }

        // Hide comment via Meta API (FB uses is_hidden, IG uses hide)
        const hideParam = platform === 'facebook' ? 'is_hidden=true' : 'hide=true';
        const hideUrl = `${META_GRAPH_URL}/${commentId}?${hideParam}&access_token=${decryptedAccount.access_token}`;
        const response = await fetch(hideUrl, { method: 'POST' });
        const result = await response.json() as CommentActionApiResponse;

        if (!response.ok) {
            console.error('[PostComments] Hide API error:', result?.error);
            return metaErrorResponse(result?.error, { platform, operation: 'hide_comment' });
        }

        return NextResponse.json({ success: true });

    } catch (error: unknown) {
        if (error instanceof Error && /Invalid commentId/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage(error, 'Forbidden') }, { status: permissionStatus });
        }
        console.error('Hide comment API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to hide comment') },
            { status: 500 }
        );
    }
}

// PATCH - Set comment hidden state (hide/unhide)
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getExplicitActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        assertJsonBodySize(request, 64 * 1024);
        const body = await request.json();
        const rawCommentId = body?.commentId as string | undefined;
        const platform = (body?.platform as string | undefined) || 'instagram';
        const hidden = Boolean(body?.hidden);

        if (!rawCommentId) {
            return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
        }
        const commentId = assertMetaGraphNodeId(rawCommentId, 'commentId')

        const { data: account } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (!decryptedAccount?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        if (!canManageCommentsWithMetaAccount(
            decryptedAccount.metadata,
            platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            return commentCapabilityErrorResponse(platform, 'manage');
        }

        const visibilityParam = platform === 'facebook'
            ? `is_hidden=${hidden ? 'true' : 'false'}`
            : `hide=${hidden ? 'true' : 'false'}`;

        const moderationUrl = `${META_GRAPH_URL}/${commentId}?${visibilityParam}&access_token=${decryptedAccount.access_token}`;
        const response = await fetch(moderationUrl, { method: 'POST' });
        const result = await response.json() as CommentActionApiResponse;

        if (!response.ok) {
            console.error('[PostComments] Comment moderation API error:', result?.error);
            return metaErrorResponse(result?.error, {
                platform,
                operation: hidden ? 'hide_comment' : 'unhide_comment',
            });
        }

        return NextResponse.json({ success: true, hidden });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid commentId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage(error, 'Forbidden') }, { status: permissionStatus });
        }
        console.error('Comment moderation API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to update comment visibility') },
            { status: 500 }
        );
    }
}
