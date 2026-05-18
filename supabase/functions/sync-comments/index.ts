// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { canReadCommentsWithMetaAccount, decryptMetaAccountRow } from "../_shared/meta-account.ts"
import { isSafeMetaGraphNodeId, META_GRAPH_API_BASE_URL } from "../_shared/meta-graph.ts";
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts";

const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

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
 * Note: Automation processing is handled by n8n workflow
 */
async function syncComments(supabase: any, workspaceId: string) {
    console.log(`[CommentSync] Starting comments sync for workspace: ${workspaceId}`);

    // Get social accounts
    const { data: accounts, error: accountsError } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (accountsError) {
        console.error(`[CommentSync] Error fetching accounts:`, redactSensitiveLogValue(accountsError));
        return { synced: 0, error: accountsError.message };
    }

    if (!accounts || accounts.length === 0) {
        console.log(`[CommentSync] No social accounts found`);
        return { synced: 0, message: 'No social accounts found' };
    }
    const decryptedAccounts = await Promise.all(accounts.map((account: any) => decryptMetaAccountRow(account)));

    // Get published posts from the last 30 days, scoped to THIS workspace only
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Step A: Get this workspace's post IDs (published_posts doesn't have workspace_id)
    const { data: workspacePosts, error: wpError } = await supabase
        .from('posts')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'published');

    if (wpError) {
        console.error(`[CommentSync] Error fetching workspace posts:`, redactSensitiveLogValue(wpError));
        return { synced: 0, error: wpError.message };
    }

    const postIds = (workspacePosts || []).map((p: any) => p.id);
    console.log(`[CommentSync] Found ${postIds.length} published posts in workspace`);

    if (postIds.length === 0) {
        console.log(`[CommentSync] No published posts in workspace, skipping published posts sync`);
    }

    // Step B: Get published_posts only for this workspace's posts
    let publishedPosts: any[] = [];
    let postsError: any = null;

    if (postIds.length > 0) {
        const result = await supabase
            .from('published_posts')
            .select('*')
            .in('post_id', postIds)
            .gte('published_at', thirtyDaysAgo.toISOString());

        publishedPosts = result.data || [];
        postsError = result.error;
    }

    if (postsError) {
        console.error(`[CommentSync] Error fetching published posts:`, redactSensitiveLogValue(postsError));
        return { synced: 0, error: postsError.message };
    }

    console.log(`[CommentSync] Found ${publishedPosts?.length || 0} published posts`);

    // Get active automations to also sync their target posts
    const { data: activeAutomations } = await supabase
        .from('automations')
        .select('platform_post_id, social_account_id')
        .eq('workspace_id', workspaceId)
        .eq('is_active', true);

    console.log(`[CommentSync] Found ${activeAutomations?.length || 0} active automations`);

    let syncedCount = 0;

    for (const account of decryptedAccounts) {
        if (!account.access_token) {
            console.log(`[CommentSync] Account ${account.id} has no access token, skipping`);
            continue;
        }

        if (!canReadCommentsWithMetaAccount(
            account.metadata,
            account.platform === 'facebook' ? 'facebook' : 'instagram',
        )) {
            console.log(`[CommentSync] Account ${account.id} lacks comment-read capability, skipping`);
            continue;
        }

        // Filter posts for this platform
        const platformPosts = publishedPosts?.filter(p => p.platform === account.platform) || [];
        console.log(`[CommentSync] Processing ${platformPosts.length} posts for ${account.platform}`);

        for (const publishedPost of platformPosts) {
            try {
                if (!isSafeMetaGraphNodeId(publishedPost.platform_post_id)) {
                    console.error(`[CommentSync] Rejected unsafe published post ID: ${publishedPost.platform_post_id}`);
                    continue;
                }
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
                        console.error(`[CommentSync] Instagram API error:`, redactSensitiveLogValue(data.error));
                    }
                } else if (account.platform === 'facebook') {
                    // Facebook: GET /{post-id}/comments?fields=id,message,created_time,from
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/comments?fields=id,message,created_time,from{id,name},comments{id,message,created_time,from{id,name}}&access_token=${account.access_token}`;

                    console.log(`[CommentSync] Fetching Facebook comments for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok && data.data) {
                        comments = data.data;
                        console.log(`[CommentSync] Found ${comments.length} Facebook comments`);
                    } else if (data.error) {
                        console.error(`[CommentSync] Facebook API error:`, redactSensitiveLogValue(data.error));
                    }
                }

                // Upsert comments
                for (const comment of comments) {
                    const commentRecord = {
                        workspace_id: workspaceId,
                        social_account_id: account.id,
                        account_id: account.account_id,
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
                        console.error(`[CommentSync] Failed to upsert comment ${comment.id}:`, redactSensitiveLogValue(upsertError));
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
                            account_id: account.account_id,
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
                            console.error(`[CommentSync] Failed to upsert reply ${reply.id}:`, redactSensitiveLogValue(replyUpsertError));
                        } else {
                            syncedCount++;
                        }
                    }
                }
            } catch (error) {
                console.error(`[CommentSync] Error syncing comments for post ${publishedPost.id}:`, redactSensitiveLogValue(error));
            }
        }
    }

    // Also sync comments for posts with active automations (even if not published through app)
    if (activeAutomations && activeAutomations.length > 0) {
        console.log(`[CommentSync] Syncing comments for automation target posts...`);

        for (const automation of activeAutomations) {
            // Find the account for this automation
            const account = decryptedAccounts.find(a => a.id === automation.social_account_id);
            if (!account?.access_token) {
                console.log(`[CommentSync] No account/token for automation post ${automation.platform_post_id}`);
                continue;
            }

            if (!canReadCommentsWithMetaAccount(
                account.metadata,
                account.platform === 'facebook' ? 'facebook' : 'instagram',
            )) {
                console.log(`[CommentSync] Account ${account.id} lacks comment-read capability for automation post ${automation.platform_post_id}`);
                continue;
            }

            // Skip if we already processed this post (it was in published_posts)
            const alreadyProcessed = publishedPosts?.some(p => p.platform_post_id === automation.platform_post_id);
            if (alreadyProcessed) {
                continue;
            }

            try {
                if (!isSafeMetaGraphNodeId(automation.platform_post_id)) {
                    console.error(`[CommentSync] Rejected unsafe automation post ID: ${automation.platform_post_id}`);
                    continue;
                }
                console.log(`[CommentSync] Fetching comments for automation post ${automation.platform_post_id}`);
                const url = `${META_GRAPH_URL}/${automation.platform_post_id}/comments?fields=id,text,timestamp,username,from{id,username},replies{id,text,timestamp,username,from{id,username}}&access_token=${account.access_token}`;

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok && data.data) {
                    console.log(`[CommentSync] Found ${data.data.length} comments on automation post`);

                    for (const comment of data.data) {
                        const commentRecord = {
                            workspace_id: workspaceId,
                            social_account_id: account.id,
                            account_id: account.account_id,
                            platform_comment_id: comment.id,
                            platform_post_id: automation.platform_post_id,
                            author_id: comment.from?.id || null,
                            author_username: comment.from?.username || comment.username || null,
                            message: comment.text || '',
                            platform_created_at: comment.timestamp || new Date().toISOString()
                        };

                        const { error: upsertError } = await supabase
                            .from('comments')
                            .upsert(commentRecord, {
                                onConflict: 'workspace_id,platform_comment_id'
                            });

                        if (!upsertError) {
                            syncedCount++;
                        }
                    }
                } else if (data.error) {
                    console.error(`[CommentSync] Error fetching automation post comments:`, redactSensitiveLogValue(data.error));
                }
            } catch (error) {
                console.error(`[CommentSync] Error processing automation post ${automation.platform_post_id}:`, redactSensitiveLogValue(error));
            }
        }
    }

    console.log(`[CommentSync] Sync complete. Total comments synced: ${syncedCount}`);

    // Note: Automation processing is handled by n8n workflow
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
        console.error('Sync comments error:', redactSensitiveLogValue(error));
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
