// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Use v21.0 to maintain compatibility with older metric names
// v22.0+ removed 'impressions' metric for Instagram media
const META_GRAPH_URL = 'https://graph.facebook.com/v21.0';

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
                    // First try to get basic media info (most reliable)
                    const basicUrl = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=like_count,comments_count,media_type&access_token=${account.access_token}`;
                    console.log(`[Sync] Fetching Instagram basic info for ${publishedPost.platform_post_id}`);

                    const basicResponse = await fetch(basicUrl);
                    const basicData = await basicResponse.json();

                    if (basicResponse.ok) {
                        console.log(`[Sync] Instagram basic response:`, JSON.stringify(basicData));
                        insights = {
                            likes: basicData.like_count || 0,
                            comments: basicData.comments_count || 0,
                            reach: 0,
                            saved: 0,
                            shares: 0,
                            impressions: 0
                        };

                        // Try to get additional insights (reach, saved) - these may fail but that's ok
                        try {
                            const insightsMetrics = 'reach,saved,shares';
                            const insightsUrl = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/insights?metric=${insightsMetrics}&access_token=${account.access_token}`;
                            const insightsResponse = await fetch(insightsUrl);
                            const insightsData = await insightsResponse.json();

                            if (insightsResponse.ok && insightsData.data) {
                                insightsData.data.forEach((metric: any) => {
                                    insights[metric.name] = metric.values?.[0]?.value || 0;
                                });
                                console.log(`[Sync] Instagram insights added:`, JSON.stringify(insights));
                            }
                        } catch (insightsError) {
                            console.log(`[Sync] Could not fetch additional insights, using basic data only`);
                        }
                    } else {
                        console.error(`[Sync] Instagram API error:`, JSON.stringify(basicData));
                    }
                } else if (publishedPost.platform === 'facebook') {
                    // Facebook post insights require pages_read_engagement which needs Meta App Review
                    // Skipping until permission is approved
                    console.log(`[Sync] Skipping Facebook post ${publishedPost.platform_post_id} — pages_read_engagement not approved`);
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

/**
 * Sync account-level analytics (follower counts, etc.)
 * This populates account_analytics for the follower growth chart
 */
async function syncAccountAnalytics(supabase: any, workspaceId: string) {
    console.log(`[AccountSync] Starting account analytics sync for workspace: ${workspaceId}`);

    // Get all social accounts for this workspace
    const { data: accounts, error: accountsError } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (accountsError) {
        console.error(`[AccountSync] Error fetching accounts:`, accountsError);
        return { synced: 0, error: accountsError.message };
    }

    if (!accounts || accounts.length === 0) {
        console.log(`[AccountSync] No social accounts found`);
        return { synced: 0, message: 'No social accounts found' };
    }

    console.log(`[AccountSync] Found ${accounts.length} social accounts`);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    let syncedCount = 0;

    for (const account of accounts) {
        if (!account.access_token) {
            console.log(`[AccountSync] Account ${account.id} (${account.platform}) has no access token, skipping`);
            continue;
        }

        try {
            let accountData = null;

            if (account.platform === 'instagram') {
                // Instagram: GET /{ig-user-id}?fields=followers_count,follows_count,media_count
                const igUserId = account.account_id;
                const url = `${META_GRAPH_URL}/${igUserId}?fields=followers_count,follows_count,media_count&access_token=${account.access_token}`;

                console.log(`[AccountSync] Fetching Instagram account data for ${igUserId}`);

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok) {
                    console.log(`[AccountSync] Instagram account data:`, JSON.stringify(data));
                    accountData = {
                        followers: data.followers_count || 0,
                        following: data.follows_count || 0,
                        posts_count: data.media_count || 0
                    };
                } else {
                    console.error(`[AccountSync] Instagram API error:`, JSON.stringify(data));
                }
            } else if (account.platform === 'facebook') {
                // Facebook: GET /{page-id}?fields=fan_count,followers_count
                const pageId = account.account_id;
                const url = `${META_GRAPH_URL}/${pageId}?fields=fan_count,followers_count&access_token=${account.access_token}`;

                console.log(`[AccountSync] Fetching Facebook page data for ${pageId}`);

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok) {
                    console.log(`[AccountSync] Facebook page data:`, JSON.stringify(data));
                    accountData = {
                        followers: data.followers_count || data.fan_count || 0,
                        following: 0, // Pages don't follow other pages
                        posts_count: 0 // Would need separate API call
                    };
                } else {
                    console.error(`[AccountSync] Facebook API error:`, JSON.stringify(data));
                }
            }

            if (accountData) {
                // Upsert to account_analytics
                const analyticsRecord = {
                    social_account_id: account.id,
                    date: today,
                    followers: accountData.followers,
                    following: accountData.following,
                    posts_count: accountData.posts_count,
                    avg_engagement_rate: 0
                };

                console.log(`[AccountSync] Upserting account analytics:`, analyticsRecord);

                const { error: upsertError } = await supabase
                    .from('account_analytics')
                    .upsert(analyticsRecord, {
                        onConflict: 'social_account_id,date'
                    });

                if (upsertError) {
                    console.error(`[AccountSync] Failed to upsert account analytics:`, upsertError);
                } else {
                    console.log(`[AccountSync] Successfully synced account ${account.id}`);
                    syncedCount++;
                }
            }
        } catch (error) {
            console.error(`[AccountSync] Error syncing account ${account.id}:`, error);
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

        // Sync both post-level insights and account-level analytics
        const postResults = await syncPostInsights(supabase, workspaceId);
        const accountResults = await syncAccountAnalytics(supabase, workspaceId);

        return new Response(
            JSON.stringify({
                posts: postResults,
                accounts: accountResults
            }),
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
