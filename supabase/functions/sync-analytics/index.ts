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

    const { data: posts } = await supabase
        .from('posts')
        .select(`
            *,
            published_posts(*)
        `)
        .eq('workspace_id', workspaceId)
        .eq('status', 'published')
        .gte('published_at', thirtyDaysAgo.toISOString())
        .order('published_at', { ascending: false });

    console.log(`[Sync] Found ${posts?.length || 0} published posts for workspace ${workspaceId}`);

    if (!posts || posts.length === 0) {
        return { synced: 0, message: 'No published posts found' };
    }

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

    for (const post of posts) {
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
                    const metrics = 'impressions,reach,engagement,likes,comments,saves';
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}/insights?metric=${metrics}&access_token=${account.access_token}`;
                    console.log(`[Sync] Fetching Instagram insights for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok) {
                        console.log(`[Sync] Instagram insights response:`, data);
                        insights = {};
                        data.data?.forEach((metric: any) => {
                            insights[metric.name] = metric.values?.[0]?.value || 0;
                        });
                    } else {
                        console.error(`[Sync] Instagram API error:`, data);
                    }
                } else if (publishedPost.platform === 'facebook') {
                    // Fetch Facebook post data
                    const url = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=likes.summary(true),comments.summary(true),shares&access_token=${account.access_token}`;
                    console.log(`[Sync] Fetching Facebook data for ${publishedPost.platform_post_id}`);

                    const response = await fetch(url);
                    const data = await response.json();

                    if (response.ok) {
                        console.log(`[Sync] Facebook response:`, data);
                        insights = {
                            likes: data.likes?.summary?.total_count || 0,
                            comments: data.comments?.summary?.total_count || 0,
                            shares: data.shares?.count || 0
                        };
                    } else {
                        console.error(`[Sync] Facebook API error:`, data);
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
                        saves: insights.saves || 0,
                        engagement_rate: insights.engagement || 0,
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
