// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Comment {
    id: string;
    text?: string;
    message?: string;
    timestamp?: string;
    created_time?: string;
    username?: string;
    from?: {
        id: string;
        username?: string;
        name?: string;
    };
    replies?: {
        data: Comment[];
    };
}

/**
 * Sync comments from Instagram and Facebook for all posts in a workspace
 */
async function syncComments(supabase: any, workspaceId: string) {
    console.log(`[CommentSync] Starting comments sync for workspace: ${workspaceId}`);

    // Get social accounts
    const { data: accounts, error: accountsError } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (accountsError) {
        console.error(`[CommentSync] Error fetching accounts:`, accountsError);
        return { synced: 0, error: accountsError.message };
    }

    if (!accounts || accounts.length === 0) {
        console.log(`[CommentSync] No social accounts found`);
        return { synced: 0, message: 'No social accounts found' };
    }

    // Get published posts from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: publishedPosts, error: postsError } = await supabase
        .from('published_posts')
        .select('*')
        .gte('published_at', thirtyDaysAgo.toISOString());

    if (postsError) {
        console.error(`[CommentSync] Error fetching published posts:`, postsError);
        return { synced: 0, error: postsError.message };
    }

    console.log(`[CommentSync] Found ${publishedPosts?.length || 0} published posts`);

    let syncedCount = 0;

    for (const account of accounts) {
        if (!account.access_token) {
            console.log(`[CommentSync] Account ${account.id} has no access token, skipping`);
            continue;
        }

        // Filter posts for this platform
        const platformPosts = publishedPosts?.filter(p => p.platform === account.platform) || [];
        console.log(`[CommentSync] Processing ${platformPosts.length} posts for ${account.platform}`);

        for (const publishedPost of platformPosts) {
            try {
                let comments: Comment[] = [];

                if (account.platform === 'instagram') {
                    // Instagram: GET /{media-id}/comments?fields=id,text,timestamp,username,from,replies
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/comments?fields=id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}&access_token=${account.access_token}`;

                    console.log(`[CommentSync] Fetching Instagram comments for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok && data.data) {
                        comments = data.data;
                        console.log(`[CommentSync] Found ${comments.length} comments`);
                    } else if (data.error) {
                        console.error(`[CommentSync] Instagram API error:`, data.error);
                    }
                } else if (account.platform === 'facebook') {
                    // Facebook: GET /{post-id}/comments?fields=id,message,created_time,from
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/comments?fields=id,message,created_time,from,comments{id,message,created_time,from}&access_token=${account.access_token}`;

                    console.log(`[CommentSync] Fetching Facebook comments for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok && data.data) {
                        comments = data.data;
                        console.log(`[CommentSync] Found ${comments.length} comments`);
                    } else if (data.error) {
                        console.error(`[CommentSync] Facebook API error:`, data.error);
                    }
                }

                // Upsert comments
                for (const comment of comments) {
                    const commentRecord = {
                        workspace_id: workspaceId,
                        social_account_id: account.id,
                        published_post_id: publishedPost.id,
                        platform_comment_id: comment.id,
                        platform_post_id: publishedPost.platform_post_id,
                        author_id: comment.from?.id || null,
                        author_username: comment.from?.username || comment.from?.name || comment.username || null,
                        message: comment.text || comment.message || '',
                        platform_created_at: comment.timestamp || comment.created_time || new Date().toISOString()
                    };

                    const { error: upsertError } = await supabase
                        .from('comments')
                        .upsert(commentRecord, {
                            onConflict: 'workspace_id,platform_comment_id'
                        });

                    if (upsertError) {
                        console.error(`[CommentSync] Failed to upsert comment ${comment.id}:`, upsertError);
                    } else {
                        syncedCount++;
                    }

                    // Handle replies (nested comments)
                    const replies = comment.replies?.data || comment.comments?.data || [];
                    for (const reply of replies) {
                        // First, get the parent comment ID from our database
                        const { data: parentComment } = await supabase
                            .from('comments')
                            .select('id')
                            .eq('platform_comment_id', comment.id)
                            .eq('workspace_id', workspaceId)
                            .single();

                        const replyRecord = {
                            workspace_id: workspaceId,
                            social_account_id: account.id,
                            published_post_id: publishedPost.id,
                            platform_comment_id: reply.id,
                            platform_post_id: publishedPost.platform_post_id,
                            parent_comment_id: parentComment?.id || null,
                            author_id: reply.from?.id || null,
                            author_username: reply.from?.username || reply.from?.name || reply.username || null,
                            message: reply.text || reply.message || '',
                            platform_created_at: reply.timestamp || reply.created_time || new Date().toISOString()
                        };

                        const { error: replyUpsertError } = await supabase
                            .from('comments')
                            .upsert(replyRecord, {
                                onConflict: 'workspace_id,platform_comment_id'
                            });

                        if (replyUpsertError) {
                            console.error(`[CommentSync] Failed to upsert reply ${reply.id}:`, replyUpsertError);
                        } else {
                            syncedCount++;
                        }
                    }
                }
            } catch (error) {
                console.error(`[CommentSync] Error syncing comments for post ${publishedPost.id}:`, error);
            }
        }
    }

    console.log(`[CommentSync] Sync complete. Total comments synced: ${syncedCount}`);
    return { synced: syncedCount };
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        const { workspaceId } = await req.json();

        if (!workspaceId) {
            return new Response(
                JSON.stringify({ error: 'workspaceId is required' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        const results = await syncComments(supabase, workspaceId);

        return new Response(
            JSON.stringify(results),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('Sync comments error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
