// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Sync post insights for published posts
 */
async function syncPostInsights(supabase: any, workspaceId: string) {
    // Get published posts from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    console.log(`[Sync] Looking for posts in workspace: ${workspaceId}`);
    console.log(`[Sync] Date filter: >= ${thirtyDaysAgo.toISOString()}`);

    // Fetch posts separately (avoiding nested query issues with PostgREST foreign keys)
    const { data: allPosts, error: allPostsError } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('status', 'published');

    console.log(`[Sync] All published posts in workspace:`, allPosts?.length || 0);
    if (allPostsError) {
        console.error(`[Sync] Error fetching posts:`, allPostsError);
        return { synced: 0, error: allPostsError.message };
    }

    if (!allPosts || allPosts.length === 0) {
        return { synced: 0, message: 'No published posts found in workspace' };
    }

    // Fetch published_posts for these posts
    const postIds = allPosts.map(p => p.id);
    const { data: publishedPostsData, error: pubPostsError } = await supabase
        .from('published_posts')
        .select('*')
        .in('post_id', postIds);

    if (pubPostsError) {
        console.error(`[Sync] Error fetching published_posts:`, pubPostsError);
        return { synced: 0, error: pubPostsError.message };
    }

    console.log(`[Sync] Published posts records:`, publishedPostsData?.length || 0);

    if (!publishedPostsData || publishedPostsData.length === 0) {
        return { synced: 0, message: 'No platform posts found (posts not published to platforms yet)' };
    }

    // Manually join the data
    const posts = allPosts.map(post => ({
        ...post,
        published_posts: publishedPostsData.filter(pp => pp.post_id === post.id)
    }));

    // Filter posts that have published_posts with recent published_at
    const recentPosts = posts.filter((post: any) => {
        if (!post.published_posts || post.published_posts.length === 0) {
            return false;
        }
        // Check if any published_post is within the date range
        return post.published_posts.some((pp: any) => {
            const publishedAt = new Date(pp.published_at);
            return publishedAt >= thirtyDaysAgo;
        });
    });

    console.log(`[Sync] Found ${posts.length} posts with published_posts`);
    console.log(`[Sync] Found ${recentPosts.length} posts with recent published_posts (last 30 days)`);

    if (!recentPosts || recentPosts.length === 0) {
        return { synced: 0, message: 'No published posts found in the last 30 days' };
    }

    // Use recentPosts for the rest of the function
    const postsToSync = recentPosts;

    // Get social accounts
    const { data: accounts } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    console.log(`[Sync] Found ${accounts?.length || 0} social accounts`);

    if (!accounts || accounts.length === 0) {
        return { synced: 0, error: 'No social accounts found' };
    }

    // Log which accounts have tokens
    accounts.forEach(acc => {
        console.log(`[Sync] Account ${acc.platform} (${acc.id}): ${acc.access_token ? 'Has token' : 'No token'}`);
    });

    let syncedCount = 0;

    for (const post of postsToSync) {
        if (!post.published_posts || post.published_posts.length === 0) {
            console.log(`[Sync] Post ${post.id} has no published_posts, skipping`);
            continue;
        }

        for (const publishedPost of post.published_posts) {
            console.log(`[Sync] Processing published post ${publishedPost.id} (${publishedPost.platform})`);

            const account = accounts.find((a: any) => a.platform === publishedPost.platform);
            if (!account || !account.access_token) {
                console.log(`[Sync] No account with token found for platform ${publishedPost.platform}`);
                continue;
            }

            try {
                let insights = null;

                if (publishedPost.platform === 'instagram') {
                    // Fetch Instagram post insights
                    // Valid metrics: impressions, reach, saved, likes, comments, shares, total_interactions, views
                    const metrics = 'impressions,reach,saved,likes,comments,shares,total_interactions';
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/insights?metric=${metrics}&access_token=${account.access_token}`;
                    console.log(`[Sync] Fetching Instagram insights for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok && data.data) {
                        console.log(`[Sync] Instagram insights response:`, JSON.stringify(data));
                        insights = {};
                        data.data?.forEach((metric: any) => {
                            insights[metric.name] = metric.values?.[0]?.value || 0;
                        });
                    } else {
                        console.error(`[Sync] Instagram API error:`, JSON.stringify(data));
                        // Try alternative: fetch basic media info instead
                        const altUrl = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=like_count,comments_count&access_token=${account.access_token}`;
                        const altResponse = await fetch(altUrl);
                        const altData = await altResponse.json();

                        if (altResponse.ok) {
                            console.log(`[Sync] Instagram alt response:`, JSON.stringify(altData));
                            insights = {
                                likes: altData.like_count || 0,
                                comments: altData.comments_count || 0,
                                impressions: 0,
                                reach: 0,
                                saved: 0,
                                shares: 0
                            };
                        } else {
                            console.error(`[Sync] Instagram alt API error:`, JSON.stringify(altData));
                        }
                    }
                } else if (publishedPost.platform === 'facebook') {
                    // Fetch Facebook post data - use reactions instead of likes for better compatibility
                    // Don't request shares directly as it doesn't work for Photos
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=reactions.summary(true),comments.summary(true)&access_token=${account.access_token}`;
                    console.log(`[Sync] Fetching Facebook data for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok) {
                        console.log(`[Sync] Facebook response:`, JSON.stringify(data));
                        insights = {
                            likes: data.reactions?.summary?.total_count || 0,
                            comments: data.comments?.summary?.total_count || 0,
                            shares: 0 // Shares not available for all post types
                        };
                    } else {
                        console.error(`[Sync] Facebook API error:`, JSON.stringify(data));
                        // Try with page token approach
                        const altUrl = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=id&access_token=${account.access_token}`;
                        const altResponse = await fetch(altUrl);
                        if (altResponse.ok) {
                            // At least the post exists, set zeros
                            insights = { likes: 0, comments: 0, shares: 0 };
                        }
                    }
                }

                if (insights) {
                    // Upsert post analytics
                    const analyticsData = {
                        published_post_id: publishedPost.id,
                        views: insights.impressions || insights.reach || 0,
                        likes: insights.likes || 0,
                        comments: insights.comments || 0,
                        shares: insights.shares || 0,
                        saves: insights.saved || insights.saves || 0,
                        engagement_rate: insights.total_interactions || 0,
                        synced_at: new Date().toISOString()
                    };

                    console.log(`[Sync] Upserting analytics for post ${publishedPost.id}:`, analyticsData);

                    const { data: upsertResult, error: upsertError } = await supabase
                        .from('post_analytics')
                        .upsert(analyticsData, {
                            onConflict: 'published_post_id'
                        });

                    if (upsertError) {
                        console.error(`[Sync] Failed to upsert analytics for post ${publishedPost.id}:`, upsertError);
                        throw upsertError;
                    }

                    console.log(`[Sync] Successfully synced post ${publishedPost.id}`);
                    syncedCount++;
                } else {
                    console.log(`[Sync] No insights returned for post ${publishedPost.id}`);
                }
            } catch (error) {
                console.error(`Error syncing insights for post ${publishedPost.id}:`, error);
            }
        }
    }

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

        // Sync post-level insights
        const results = await syncPostInsights(supabase, workspaceId);

        return new Response(
            JSON.stringify(results),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('Sync analytics error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
