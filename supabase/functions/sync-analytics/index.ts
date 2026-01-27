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

    if (!posts || posts.length === 0) {
        return { synced: 0 };
    }

    // Get social accounts
    const { data: accounts } = await supabase
        .from('social_accounts')
        .select('*')
        .eq('workspace_id', workspaceId);

    if (!accounts || accounts.length === 0) {
        return { synced: 0, error: 'No social accounts found' };
    }

    let syncedCount = 0;

    for (const post of posts) {
        if (!post.published_posts || post.published_posts.length === 0) continue;

        for (const publishedPost of post.published_posts) {
            const account = accounts.find((a: any) => a.platform === publishedPost.platform);
            if (!account || !account.access_token) continue;

            try {
                let insights = null;

                if (publishedPost.platform === 'instagram') {
                    // Fetch Instagram post insights
                    const metrics = 'impressions,reach,engagement,likes,comments,saves';
                    const response = await fetch(
                        `${META_GRAPH_URL}/${publishedPost.platform_post_id}/insights?metric=${metrics}&access_token=${account.access_token}`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        insights = {};
                        data.data?.forEach((metric: any) => {
                            insights[metric.name] = metric.values?.[0]?.value || 0;
                        });
                    }
                } else if (publishedPost.platform === 'facebook') {
                    // Fetch Facebook post data
                    const response = await fetch(
                        `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=likes.summary(true),comments.summary(true),shares&access_token=${account.access_token}`
                    );

                    if (response.ok) {
                        const data = await response.json();
                        insights = {
                            likes: data.likes?.summary?.total_count || 0,
                            comments: data.comments?.summary?.total_count || 0,
                            shares: data.shares?.count || 0
                        };
                    }
                }

                if (insights) {
                    // Upsert post analytics
                    await supabase.from('post_analytics').upsert({
                        published_post_id: publishedPost.id,
                        views: insights.impressions || insights.reach || 0,
                        likes: insights.likes || 0,
                        comments: insights.comments || 0,
                        shares: insights.shares || 0,
                        saves: insights.saves || 0,
                        engagement_rate: insights.engagement || 0,
                        synced_at: new Date().toISOString()
                    }, {
                        onConflict: 'published_post_id'
                    });

                    syncedCount++;
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
