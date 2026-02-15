import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

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
                throw new Error(data.error?.message || 'Failed to fetch comments');
            }

            comments = (data.data || []).map((c: any) => ({
                id: c.id,
                platform_comment_id: c.id,
                author_username: c.from?.username || c.username || 'Unknown',
                message: c.text || '',
                timestamp: c.timestamp,
                replies: (c.replies?.data || []).map((r: any) => ({
                    id: r.id,
                    platform_comment_id: r.id,
                    author_username: r.from?.username || r.username || 'Unknown',
                    message: r.text || '',
                    timestamp: r.timestamp,
                })),
            }));

        } else if (platform === 'facebook') {
            // Facebook: GET /{post-id}/comments
            const url = `${META_GRAPH_URL}/${postId}/comments?fields=id,message,created_time,from{id,name},comments{id,message,created_time,from{id,name}}&access_token=${account.access_token}`;

            console.log(`[PostComments] Fetching Facebook comments for ${postId}`);
            const response = await fetch(url);
            const data = await response.json();

            if (!response.ok) {
                console.error('[PostComments] Facebook API error:', data.error);
                throw new Error(data.error?.message || 'Failed to fetch comments');
            }

            comments = (data.data || []).map((c: any) => ({
                id: c.id,
                platform_comment_id: c.id,
                author_username: c.from?.name || 'Unknown',
                message: c.message || '',
                timestamp: c.created_time,
                replies: (c.comments?.data || []).map((r: any) => ({
                    id: r.id,
                    platform_comment_id: r.id,
                    author_username: r.from?.name || 'Unknown',
                    message: r.message || '',
                    timestamp: r.created_time,
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
            throw new Error(result.error?.message || 'Failed to post reply');
        }

        return NextResponse.json({
            success: true,
            replyId: result.id,
        });

    } catch (error: any) {
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

        // Hide comment via Meta API
        const hideUrl = `${META_GRAPH_URL}/${commentId}?hide=true&access_token=${account.access_token}`;
        const response = await fetch(hideUrl, { method: 'POST' });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to hide comment');
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Hide comment API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to hide comment' },
            { status: 500 }
        );
    }
}
