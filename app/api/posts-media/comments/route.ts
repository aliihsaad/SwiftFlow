import { NextRequest, NextResponse } from 'next/server';
import {
    canManageCommentsWithMetaAccount,
    canReadCommentsWithMetaAccount,
    decryptMetaAccountRow,
} from '@/lib/meta-account';
import { normalizeMetaGraphError, type MetaGraphErrorShape } from '@/lib/meta-graph-errors';
import { getMetaGraphApiBaseUrl } from '@/lib/meta-graph-version';
import { assertJsonBodySize, assertMetaGraphNodeId } from '@/lib/security/phase1-validation';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';
import { getActiveWorkspace, getExplicitActiveWorkspace } from '@/lib/workspace-utils';
import { createClient } from '@/utils/supabase/server';

const PLATFORM = 'instagram' as const;

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

type CommentActionApiResponse = {
    id?: string;
    success?: boolean;
    error?: MetaGraphErrorShape;
};

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function capabilityError(mode: 'read' | 'manage') {
    return NextResponse.json(
        {
            error: mode === 'read'
                ? 'Instagram comment access is not available for this connected account'
                : 'Instagram comment management is not available for this connected account',
            errorCode: 'meta_missing_permission',
            missingPermissions: [
                mode === 'read'
                    ? 'instagram_business_basic'
                    : 'instagram_business_manage_comments',
            ],
            requiresReconnect: true,
        },
        { status: 403 },
    );
}

function graphErrorResponse(
    graphError: MetaGraphErrorShape | null | undefined,
    operation: 'fetch_comments' | 'reply_comment' | 'hide_comment' | 'unhide_comment',
) {
    const normalized = normalizeMetaGraphError(graphError, {
        feature: 'comments',
        platform: PLATFORM,
        operation,
    });

    return NextResponse.json(
        {
            error: normalized.message,
            errorCode: normalized.code,
            missingPermissions: normalized.missingPermissions,
            requiresReconnect: normalized.requiresReconnect,
            meta: normalized.meta,
        },
        { status: normalized.httpStatus },
    );
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }

        const postId = assertMetaGraphNodeId(
            new URL(request.url).searchParams.get('postId'),
            'postId',
        );

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json(
                { error: 'No Instagram account or token available', comments: [] },
                { status: 400 },
            );
        }

        if (!canReadCommentsWithMetaAccount(decryptedAccount.metadata, PLATFORM)) {
            return capabilityError('read');
        }

        const graphParams = new URLSearchParams({
            fields: 'id,text,timestamp,username,hidden,from{id,username},replies{id,text,timestamp,username,hidden,from{id,username}}',
            access_token: decryptedAccount.access_token,
        });
        const response = await fetch(
            getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method)
                + '/' + postId + '/comments?' + graphParams.toString(),
            { cache: 'no-store' },
        );
        const data = await response.json() as {
            data?: InstagramCommentApiItem[];
            error?: MetaGraphErrorShape;
        };

        if (!response.ok) {
            return graphErrorResponse(data.error, 'fetch_comments');
        }

        const toComment = (comment: InstagramCommentApiItem) => ({
            id: comment.id,
            platform_comment_id: comment.id,
            author_username: comment.from?.username || comment.username || 'Unknown',
            message: comment.text || '',
            timestamp: comment.timestamp || '',
            is_hidden: Boolean(comment.hidden),
            replies: (comment.replies?.data || []).map((reply) => ({
                id: reply.id,
                platform_comment_id: reply.id,
                author_username: reply.from?.username || reply.username || 'Unknown',
                message: reply.text || '',
                timestamp: reply.timestamp || '',
                is_hidden: Boolean(reply.hidden),
                replies: [],
            })),
        });

        return NextResponse.json({
            comments: (data.data || []).map(toComment),
            account: {
                id: decryptedAccount.id,
                account_name: decryptedAccount.account_name,
                platform: PLATFORM,
            },
            workspaceId: activeWorkspace.id,
        });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid postId/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error('Instagram comments API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to fetch Instagram comments') },
            { status: 500 },
        );
    }
}

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
        const commentId = assertMetaGraphNodeId(body?.commentId, 'commentId');
        const message = typeof body?.message === 'string' ? body.message.trim() : '';

        if (!message) {
            return NextResponse.json({ error: 'message is required' }, { status: 400 });
        }

        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (accountError || !decryptedAccount?.access_token) {
            return NextResponse.json({ error: 'No Instagram account or token available' }, { status: 400 });
        }
        if (!canManageCommentsWithMetaAccount(decryptedAccount.metadata, PLATFORM)) {
            return capabilityError('manage');
        }

        const response = await fetch(
            getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method)
                + '/' + commentId + '/replies',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    access_token: decryptedAccount.access_token,
                }),
            },
        );
        const result = await response.json() as CommentActionApiResponse;

        if (!response.ok) {
            return graphErrorResponse(result.error, 'reply_comment');
        }

        return NextResponse.json({ success: true, replyId: result.id });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid commentId|Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage(error, 'Forbidden') }, { status: permissionStatus });
        }
        console.error('Instagram comment reply API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to reply to Instagram comment') },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const url = new URL(request.url);
    return setCommentHidden(request, url.searchParams.get('commentId'), true);
}

export async function PATCH(request: NextRequest) {
    try {
        assertJsonBodySize(request, 64 * 1024);
        const body = await request.json();
        return setCommentHidden(request, body?.commentId, Boolean(body?.hidden), body);
    } catch (error: unknown) {
        if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        throw error;
    }
}

async function setCommentHidden(
    request: NextRequest,
    rawCommentId: unknown,
    hidden: boolean,
    parsedBody?: unknown,
) {
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

        if (parsedBody === undefined && request.method === 'DELETE') {
            assertJsonBodySize(request, 64 * 1024);
        }
        const commentId = assertMetaGraphNodeId(rawCommentId, 'commentId');

        const { data: account } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)
            .single();
        const decryptedAccount = account ? decryptMetaAccountRow(account) : null;

        if (!decryptedAccount?.access_token) {
            return NextResponse.json({ error: 'No Instagram account or token available' }, { status: 400 });
        }
        if (!canManageCommentsWithMetaAccount(decryptedAccount.metadata, PLATFORM)) {
            return capabilityError('manage');
        }

        const graphParams = new URLSearchParams({
            hide: hidden ? 'true' : 'false',
            access_token: decryptedAccount.access_token,
        });
        const response = await fetch(
            getMetaGraphApiBaseUrl(decryptedAccount.metadata?.connection_method)
                + '/' + commentId + '?' + graphParams.toString(),
            { method: 'POST' },
        );
        const result = await response.json() as CommentActionApiResponse;

        if (!response.ok) {
            return graphErrorResponse(result.error, hidden ? 'hide_comment' : 'unhide_comment');
        }

        return NextResponse.json({ success: true, hidden });
    } catch (error: unknown) {
        if (error instanceof Error && /Invalid commentId/i.test(error.message)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: errorMessage(error, 'Forbidden') }, { status: permissionStatus });
        }
        console.error('Instagram comment moderation API error:', error);
        return NextResponse.json(
            { error: errorMessage(error, 'Failed to update Instagram comment visibility') },
            { status: 500 },
        );
    }
}
