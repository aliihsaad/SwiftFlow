import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';
import { normalizeMetaGraphError } from '@/lib/meta-graph-errors';
import { getWorkspacePermissionErrorStatus, requireWorkspacePermission } from '@/lib/workspace-permissions';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

function metaErrorResponse(
    graphError: any,
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
        const postId = searchParams.get('postId'); // platform_post_id (media ID or post ID)
        const platform = searchParams.get('platform') || 'instagram';

        if (!postId) {
            return NextResponse.json({ error: 'postId is required' }, { status: 400 });
        }

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

        if (!account.access_token) {
            return NextResponse.json(
                { error: 'No access token available' },
                { status: 400 }
            );
        }

        let comments: any[] = [];

        if (platform === 'instagram') {
            // Instagram: GET /{media-id}/comments
            const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}&access_token=${account.access_token}`;

            console.log(`[PostComments] Fetching Instagram comments for ${postId}`);
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                console.error('[PostComments] Instagram API error:', data.error);
                return metaErrorResponse(data?.error, { platform, operation: 'fetch_comments' });
            }

            comments = (data.data || []).map((c: any) => ({
                id: c.id,
                platform_comment_id: c.id,
                author_username: c.from?.username || c.username || 'Unknown',
                message: c.text || '',
                timestamp: c.timestamp,
                is_hidden: !!c.hidden,
                replies: (c.replies?.data || []).map((r: any) => ({
                    id: r.id,
                    platform_comment_id: r.id,
                    author_username: r.from?.username || r.username || 'Unknown',
                    message: r.text || '',
                    timestamp: r.timestamp,
                    is_hidden: !!r.hidden,
                })),
            }));

        } else if (platform === 'facebook') {
            // Facebook: GET /{post-id}/comments
            const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,message,created_time,is_hidden,from{id,name},comments{id,message,created_time,is_hidden,from{id,name}}&access_token=${account.access_token}`;

            console.log(`[PostComments] Fetching Facebook comments for ${postId}`);
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                console.error('[PostComments] Facebook API error:', data.error);
                return metaErrorResponse(data?.error, { platform, operation: 'fetch_comments' });
            }

            comments = (data.data || [])
                .map((c: any) => ({
                    id: c.id,
                    platform_comment_id: c.id,
                    author_username: c.from?.name || 'Unknown',
                    message: c.message || '',
                    timestamp: c.created_time,
                    is_hidden: !!c.is_hidden,
                    replies: (c.comments?.data || [])
                        .map((r: any) => ({
                            id: r.id,
                            platform_comment_id: r.id,
                            author_username: r.from?.name || 'Unknown',
                            message: r.message || '',
                            timestamp: r.created_time,
                            is_hidden: !!r.is_hidden,
                        })),
                }));
        }

        return NextResponse.json({
            comments,
            account: {
                id: account.id,
                account_name: account.account_name,
                platform: account.platform,
            },
            workspaceId: activeWorkspace.id,
        });

    } catch (error: any) {
        console.error('Post comments API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch comments' },
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

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        const body = await request.json();
        const { commentId, message, platform } = body;

        if (!commentId || !message || !platform) {
            return NextResponse.json(
                { error: 'commentId, message, and platform are required' },
                { status: 400 }
            );
        }

        // Get the social account
        const { data: account, error: accountError } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (accountError || !account?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
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
                access_token: account.access_token,
            }),
        });

        const result = await response.json();

        if (!response.ok) {
            console.error('[PostComments] Reply API error:', result?.error);
            return metaErrorResponse(result?.error, { platform, operation: 'reply_comment' });
        }

        return NextResponse.json({
            success: true,
            replyId: result.id,
        });

    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: error.message || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Reply to comment API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to reply to comment' },
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

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        const { searchParams } = new URL(request.url);
        const commentId = searchParams.get('commentId');
        const platform = searchParams.get('platform') || 'instagram';

        if (!commentId) {
            return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
        }

        // Get the social account
        const { data: account } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        // Hide comment via Meta API (FB uses is_hidden, IG uses hide)
        const hideParam = platform === 'facebook' ? 'is_hidden=true' : 'hide=true';
        const hideUrl = `${META_GRAPH_URL}/${commentId}?${hideParam}&access_token=${account.access_token}`;
        const response = await fetch(hideUrl, { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
            console.error('[PostComments] Hide API error:', result?.error);
            return metaErrorResponse(result?.error, { platform, operation: 'hide_comment' });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: error.message || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Hide comment API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to hide comment' },
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

        const activeWorkspace = await getActiveWorkspace();
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 });
        }
        await requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write');

        const body = await request.json();
        const commentId = body?.commentId as string | undefined;
        const platform = (body?.platform as string | undefined) || 'instagram';
        const hidden = Boolean(body?.hidden);

        if (!commentId) {
            return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
        }

        const { data: account } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', platform)
            .single();

        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No account or token available' },
                { status: 400 }
            );
        }

        const visibilityParam = platform === 'facebook'
            ? `is_hidden=${hidden ? 'true' : 'false'}`
            : `hide=${hidden ? 'true' : 'false'}`;

        const moderationUrl = `${META_GRAPH_URL}/${commentId}?${visibilityParam}&access_token=${account.access_token}`;
        const response = await fetch(moderationUrl, { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
            console.error('[PostComments] Comment moderation API error:', result?.error);
            return metaErrorResponse(result?.error, {
                platform,
                operation: hidden ? 'hide_comment' : 'unhide_comment',
            });
        }

        return NextResponse.json({ success: true, hidden });
    } catch (error: any) {
        const permissionStatus = getWorkspacePermissionErrorStatus(error);
        if (permissionStatus) {
            return NextResponse.json({ error: error.message || 'Forbidden' }, { status: permissionStatus });
        }
        console.error('Comment moderation API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to update comment visibility' },
            { status: 500 }
        );
    }
}
