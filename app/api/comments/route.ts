import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getActiveWorkspace } from '@/lib/workspace-utils';

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

// GET - List comments with pagination
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

        // Parse query params
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const postId = searchParams.get('postId');
        const offset = (page - 1) * limit;

        // Build query
        let query = supabase
            .from('comments')
            .select('*, social_accounts(platform, account_name)', { count: 'exact' })
            .eq('workspace_id', activeWorkspace.id)
            .is('parent_comment_id', null) // Only top-level comments
            .order('platform_created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (postId) {
            query = query.eq('published_post_id', postId);
        }

        const { data: comments, error, count } = await query;

        if (error) {
            throw error;
        }

        // Get all published_post_ids from comments
        const publishedPostIds = [...new Set((comments || []).map(c => c.published_post_id).filter(Boolean))];

        // Fetch published posts with their original posts
        let postsMap: Record<string, any> = {};
        if (publishedPostIds.length > 0) {
            const { data: publishedPosts } = await supabase
                .from('published_posts')
                .select('id, post_id, platform, platform_post_id, permalink')
                .in('id', publishedPostIds);

            if (publishedPosts && publishedPosts.length > 0) {
                const postIds = publishedPosts.map(pp => pp.post_id).filter(Boolean);
                const { data: posts } = await supabase
                    .from('posts')
                    .select('id, content, media_urls')
                    .in('id', postIds);

                // Create a map of published_post_id -> post info
                for (const pp of publishedPosts) {
                    const post = posts?.find(p => p.id === pp.post_id);
                    postsMap[pp.id] = {
                        published_post_id: pp.id,
                        platform_post_id: pp.platform_post_id,
                        permalink: pp.permalink,
                        content: post?.content || '',
                        media_urls: post?.media_urls || []
                    };
                }
            }
        }

        // Fetch replies for each comment and attach post info
        const commentsWithReplies = await Promise.all(
            (comments || []).map(async (comment) => {
                const { data: replies } = await supabase
                    .from('comments')
                    .select('*')
                    .eq('parent_comment_id', comment.id)
                    .order('platform_created_at', { ascending: true });

                return {
                    ...comment,
                    replies: replies || [],
                    post: comment.published_post_id ? postsMap[comment.published_post_id] || null : null
                };
            })
        );

        return NextResponse.json({
            comments: commentsWithReplies,
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            },
            workspaceId: activeWorkspace.id
        });

    } catch (error: any) {
        console.error('Get comments API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch comments' },
            { status: 500 }
        );
    }
}

// POST - Reply to a comment
export async function POST(request: NextRequest) {
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

        const body = await request.json();
        const { commentId, message } = body;

        if (!commentId || !message) {
            return NextResponse.json(
                { error: 'commentId and message are required' },
                { status: 400 }
            );
        }

        // Get the comment details
        const { data: comment, error: commentError } = await supabase
            .from('comments')
            .select('*, social_accounts(*)')
            .eq('id', commentId)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (commentError || !comment) {
            return NextResponse.json(
                { error: 'Comment not found' },
                { status: 404 }
            );
        }

        const account = comment.social_accounts;
        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        // Post reply via Meta API
        let replyUrl: string;
        if (account.platform === 'instagram') {
            // Instagram: POST /{comment-id}/replies
            replyUrl = `${META_GRAPH_URL}/${comment.platform_comment_id}/replies`;
        } else {
            // Facebook: POST /{comment-id}/comments
            replyUrl = `${META_GRAPH_URL}/${comment.platform_comment_id}/comments`;
        }

        const response = await fetch(replyUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                access_token: account.access_token
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to post reply');
        }

        // Update the comment to mark it as replied
        await supabase
            .from('comments')
            .update({ replied_at: new Date().toISOString() })
            .eq('id', commentId);

        // Optionally store our reply as a comment too
        if (result.id) {
            await supabase.from('comments').insert({
                workspace_id: activeWorkspace.id,
                social_account_id: account.id,
                published_post_id: comment.published_post_id,
                platform_comment_id: result.id,
                platform_post_id: comment.platform_post_id,
                parent_comment_id: comment.id,
                author_id: account.account_id,
                author_username: account.account_name,
                message,
                platform_created_at: new Date().toISOString()
            });
        }

        return NextResponse.json({
            success: true,
            replyId: result.id
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
        const commentId = searchParams.get('commentId');

        if (!commentId) {
            return NextResponse.json(
                { error: 'commentId is required' },
                { status: 400 }
            );
        }

        // Get the comment details
        const { data: comment, error: commentError } = await supabase
            .from('comments')
            .select('*, social_accounts(*)')
            .eq('id', commentId)
            .eq('workspace_id', activeWorkspace.id)
            .single();

        if (commentError || !comment) {
            return NextResponse.json(
                { error: 'Comment not found' },
                { status: 404 }
            );
        }

        const account = comment.social_accounts;
        if (!account?.access_token) {
            return NextResponse.json(
                { error: 'No access token available for this account' },
                { status: 400 }
            );
        }

        // Hide comment via Meta API
        // Instagram & Facebook both use: POST /{comment-id}?hide=true
        const hideUrl = `${META_GRAPH_URL}/${comment.platform_comment_id}?hide=true&access_token=${account.access_token}`;

        const response = await fetch(hideUrl, {
            method: 'POST'
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to hide comment');
        }

        // Update local database
        await supabase
            .from('comments')
            .update({ is_hidden: true })
            .eq('id', commentId);

        return NextResponse.json({
            success: true
        });

    } catch (error: any) {
        console.error('Hide comment API error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to hide comment' },
            { status: 500 }
        );
    }
}
