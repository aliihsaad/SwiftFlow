// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { canReadAnalyticsWithMetaAccount, decryptMetaAccountRow } from "../_shared/meta-account.ts"
import { META_GRAPH_API_BASE_URL } from "../_shared/meta-graph.ts";
import { redactSensitiveLogValue, redactSensitiveString } from "../_shared/log-redaction.ts";

// Use v21.0 to maintain compatibility with older metric names
// v22.0+ removed 'impressions' metric for Instagram media
const META_GRAPH_URL = META_GRAPH_API_BASE_URL;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function extractInstagramInsightMetricValue(metric: any): number {
    const rawValue = metric?.values?.[0]?.value;
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) return rawValue;
    if (typeof rawValue === 'string') {
        const parsed = Number(rawValue);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (rawValue && typeof rawValue === 'object') {
        const firstNumeric = Object.values(rawValue).find((v) => typeof v === 'number' && Number.isFinite(v));
        if (typeof firstNumeric === 'number') return firstNumeric;
    }
    return 0;
}

function summarizeMetaGraphPayload(payload: any): string {
    const error = payload?.error;
    if (error && typeof error === 'object') {
        const code = error.code ?? 'unknown';
        const subcode = error.error_subcode ?? 'unknown';
        const type = error.type ?? 'unknown';
        const message = typeof error.message === 'string' ? redactSensitiveString(error.message) : 'unknown';
        return `error_type=${type} error_code=${code} error_subcode=${subcode} message=${message}`;
    }

    if (Array.isArray(payload?.data)) {
        return `items=${payload.data.length}`;
    }

    if (payload && typeof payload === 'object') {
        const keys = Object.keys(payload).slice(0, 6);
        return keys.length > 0 ? `keys=${keys.join(',')}` : 'empty_object';
    }

    return typeof payload === 'string' && payload.length > 0 ? redactSensitiveString(payload) : 'no_details';
}

function logMetaGraphWarning(context: string, payload: any) {
    console.warn(`${context}: ${summarizeMetaGraphPayload(payload)}`);
}

function summarizeError(error: any): string {
    if (error instanceof Error) return redactSensitiveString(error.message);
    if (typeof error?.message === 'string') return redactSensitiveString(error.message);
    return redactSensitiveString(String(error));
}

async function fetchInstagramMediaInsightsBestEffort(mediaId: string, accessToken: string, mediaType?: string) {
    const metrics: Record<string, number> = {
        reach: 0,
        saved: 0,
        shares: 0,
        impressions: 0,
        video_views: 0,
        plays: 0,
    };

    const tryMetricRequest = async (metricNames: string[]) => {
        const url = `${META_GRAPH_URL}/${mediaId}/insights?metric=${metricNames.join(',')}&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            logMetaGraphWarning(`[Sync] Instagram insights unavailable for ${mediaId} metrics=[${metricNames.join(',')}]`, data);
            return false;
        }

        if (Array.isArray(data?.data)) {
            for (const metric of data.data) {
                const name = String(metric?.name || '');
                if (!name) continue;
                metrics[name] = extractInstagramInsightMetricValue(metric);
            }
        }
        return true;
    };

    // Common media metrics (usually available when insights access is granted).
    await tryMetricRequest(['reach', 'saved', 'shares']);

    // Request impressions separately since it can be unsupported for some media types/API versions.
    await tryMetricRequest(['impressions']);

    const normalizedMediaType = String(mediaType || '').toUpperCase();
    if (normalizedMediaType.includes('VIDEO') || normalizedMediaType.includes('REEL')) {
        const gotVideoViews = await tryMetricRequest(['video_views']);
        if (!gotVideoViews) {
            await tryMetricRequest(['plays']);
        }
    }

    return {
        reach: metrics.reach || 0,
        saved: metrics.saved || 0,
        shares: metrics.shares || 0,
        impressions: metrics.impressions || 0,
        video_views: metrics.video_views || 0,
        plays: metrics.plays || 0,
        // Normalize "views" for UI/storage fallback preference
        views: metrics.impressions || metrics.video_views || metrics.plays || metrics.reach || 0,
    };
}

async function fetchFacebookPostInsightsBestEffort(postId: string, accessToken: string) {
    const metrics: Record<string, number> = {
        post_impressions: 0,
        post_impressions_unique: 0,
        post_engaged_users: 0,
        post_video_views: 0,
    };

    const tryMetricRequest = async (metricNames: string[]) => {
        const url = `${META_GRAPH_URL}/${postId}/insights?metric=${metricNames.join(',')}&access_token=${accessToken}`;
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
            logMetaGraphWarning(`[Sync] Facebook insights unavailable for ${postId} metrics=[${metricNames.join(',')}]`, data);
            return false;
        }

        if (Array.isArray(data?.data)) {
            for (const metric of data.data) {
                const name = String(metric?.name || '');
                if (!name) continue;
                metrics[name] = extractInstagramInsightMetricValue(metric);
            }
        }
        return true;
    };

    // Try commonly supported page post metrics first.
    await tryMetricRequest(['post_impressions', 'post_impressions_unique', 'post_engaged_users']);
    // Video posts may expose a dedicated views metric.
    await tryMetricRequest(['post_video_views']);

    return {
        impressions: metrics.post_impressions || 0,
        reach: metrics.post_impressions_unique || 0,
        engaged_users: metrics.post_engaged_users || 0,
        video_views: metrics.post_video_views || 0,
        views: metrics.post_impressions || metrics.post_video_views || metrics.post_impressions_unique || 0,
    };
}

/**
 * Sync post insights for published posts
 */
async function syncPostInsights(supabase: any, workspaceId: string) {
    // Match the analytics dashboard's widest range so the health checks and charts stay aligned.
    const analyticsLookbackDays = 90;
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - analyticsLookbackDays);

    console.log(`[Sync] Looking for posts in workspace: ${workspaceId}`);
    console.log(`[Sync] Date filter: >= ${lookbackStart.toISOString()}`);

    // Fetch posts separately (avoiding nested query issues with PostgREST foreign keys)
    const { data: allPosts, error: allPostsError } = await supabase
        .from('posts')
        .select('*')
        .eq('workspace_id', workspaceId);

    console.log(`[Sync] All posts in workspace:`, allPosts?.length || 0);
    if (allPostsError) {
        console.error(`[Sync] Error fetching posts:`, redactSensitiveLogValue(allPostsError));
        return { synced: 0, error: allPostsError.message };
    }

    const allPostsList = allPosts || [];
    if (allPostsList.length === 0) {
        console.log('[Sync] No app-managed posts found in workspace; continuing with direct/native post sync');
    }

    // Fetch published_posts for these posts
    const postIds = allPostsList.map(p => p.id);
    let publishedPostsData: any[] = [];

    if (postIds.length > 0) {
        const { data: pubRows, error: pubPostsError } = await supabase
            .from('published_posts')
            .select('*')
            .in('post_id', postIds);

        if (pubPostsError) {
            console.error(`[Sync] Error fetching published_posts:`, redactSensitiveLogValue(pubPostsError));
            return { synced: 0, error: pubPostsError.message };
        }

        publishedPostsData = pubRows || [];
    }

    console.log(`[Sync] Published posts records:`, publishedPostsData?.length || 0);

    if (!publishedPostsData || publishedPostsData.length === 0) {
        console.log('[Sync] No app-managed published_posts found; continuing with direct/native post sync');
    }

    // Manually join the data
    const posts = allPostsList.map(post => ({
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
            return publishedAt >= lookbackStart;
        });
    });

    console.log(`[Sync] Found ${posts.length} posts with published_posts`);
    console.log(`[Sync] Found ${recentPosts.length} posts with recent published_posts (last ${analyticsLookbackDays} days)`);

    if (!recentPosts || recentPosts.length === 0) {
        console.log('[Sync] No recent app-managed published posts; continuing with direct/native post sync');
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
    const decryptedAccounts = await Promise.all(accounts.map((account: any) => decryptMetaAccountRow(account)));

    // Log which accounts have tokens
    decryptedAccounts.forEach(acc => {
        console.log(`[Sync] Account ${acc.platform} (${acc.id}): token=${acc.access_token ? 'yes' : 'no'} analytics=${canReadAnalyticsWithMetaAccount(acc.metadata) ? 'yes' : 'no'}`);
    });

    let syncedCount = 0;
    let directPublishedCount = 0;
    let directMetricsCount = 0;
    let directErrorCount = 0;

    const upsertPublishedPost = async (payload: {
        platform: string;
        platform_post_id: string;
        permalink?: string | null;
        published_at?: string | null;
        social_account_id?: string;
        platform_caption?: string | null;
    }) => {
        const basePayload: any = {
            platform: payload.platform,
            platform_post_id: payload.platform_post_id,
            permalink: payload.permalink || null,
            published_at: payload.published_at || new Date().toISOString(),
            social_account_id: payload.social_account_id,
            platform_caption: payload.platform_caption || null
        };

        let upsertResult = await supabase
            .from('published_posts')
            .upsert(basePayload, { onConflict: 'platform,platform_post_id' })
            .select('id, post_id')
            .single();

        if (upsertResult.error && /social_account_id|platform_caption/i.test(String(upsertResult.error.message || ''))) {
            throw new Error('Missing published_posts.social_account_id/platform_caption columns. Run the latest migration first.');
        }

        if (upsertResult.error) throw upsertResult.error;
        return upsertResult.data;
    };

    const upsertPostAnalytics = async (publishedPostId: string, metrics: {
        views?: number;
        likes?: number;
        comments?: number;
        shares?: number;
        saves?: number;
        engagement_rate?: number;
    }) => {
        const { error } = await supabase
            .from('post_analytics')
            .upsert({
                published_post_id: publishedPostId,
                views: metrics.views || 0,
                likes: metrics.likes || 0,
                comments: metrics.comments || 0,
                shares: metrics.shares || 0,
                saves: metrics.saves || 0,
                engagement_rate: metrics.engagement_rate || 0,
                synced_at: new Date().toISOString()
            }, { onConflict: 'published_post_id' });

        if (error) throw error;
    };

    for (const post of postsToSync) {
        if (!post.published_posts || post.published_posts.length === 0) {
            console.log(`[Sync] Post ${post.id} has no published_posts, skipping`);
            continue;
        }

        for (const publishedPost of post.published_posts) {
            console.log(`[Sync] Processing published post ${publishedPost.id} (${publishedPost.platform})`);

            const account = decryptedAccounts.find((a: any) => a.platform === publishedPost.platform);
            if (!account || !account.access_token) {
                console.log(`[Sync] No account with token found for platform ${publishedPost.platform}`);
                continue;
            }

            if (!canReadAnalyticsWithMetaAccount(account.metadata)) {
                console.log(`[Sync] Account ${account.id} lacks analytics capability for platform ${publishedPost.platform}, skipping`);
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
                        console.log(`[Sync] Instagram basic info fetched for ${publishedPost.platform_post_id}`);
                        insights = {
                            likes: basicData.like_count || 0,
                            comments: basicData.comments_count || 0,
                            reach: 0,
                            saved: 0,
                            shares: 0,
                            impressions: 0,
                            views: 0
                        };

                        // Try to enrich with additional insights (reach, saves, views) when available.
                        try {
                            const igInsights = await fetchInstagramMediaInsightsBestEffort(
                                publishedPost.platform_post_id,
                                account.access_token,
                                basicData.media_type || undefined,
                            );
                            insights = {
                                ...insights,
                                reach: igInsights.reach || 0,
                                saved: igInsights.saved || 0,
                                shares: igInsights.shares || 0,
                                impressions: igInsights.impressions || 0,
                                views: igInsights.views || 0,
                            };
                            console.log(`[Sync] Instagram insights added for ${publishedPost.platform_post_id}`);
                        } catch (insightsError) {
                            console.log(`[Sync] Could not fetch additional insights, using basic data only`);
                        }
                    } else {
                        logMetaGraphWarning(`[Sync] Instagram basic info request failed for ${publishedPost.platform_post_id}`, basicData);
                    }
                } else if (publishedPost.platform === 'facebook') {
                    let likes = 0;
                    let comments = 0;
                    let shares = 0;
                    let views = 0;
                    let impressions = 0;
                    let reach = 0;

                    try {
                        const metricsUrl = `${META_GRAPH_URL}/${publishedPost.platform_post_id}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${account.access_token}`;
                        const metricsResponse = await fetch(metricsUrl);
                        const metricsData = await metricsResponse.json();

                        if (metricsResponse.ok) {
                            likes = metricsData?.likes?.summary?.total_count || 0;
                            comments = metricsData?.comments?.summary?.total_count || 0;
                            shares = metricsData?.shares?.count || 0;
                        } else {
                            logMetaGraphWarning(`[Sync] Facebook metrics unavailable for ${publishedPost.platform_post_id}`, metricsData);
                        }
                    } catch (metricsError) {
                        console.log(`[Sync] Facebook metrics fetch failed for ${publishedPost.platform_post_id}: ${summarizeError(metricsError)}`);
                    }

                    try {
                        const fbInsights = await fetchFacebookPostInsightsBestEffort(
                            publishedPost.platform_post_id,
                            account.access_token,
                        );
                        views = fbInsights.views || 0;
                        impressions = fbInsights.impressions || 0;
                        reach = fbInsights.reach || 0;
                    } catch (insightsError) {
                        console.log(`[Sync] Facebook insights fetch failed for ${publishedPost.platform_post_id}: ${summarizeError(insightsError)}`);
                    }

                    insights = {
                        likes,
                        comments,
                        shares,
                        views,
                        impressions,
                        reach,
                        saved: 0,
                    };
                }

                if (insights) {
                    // Upsert post analytics
                    const analyticsData = {
                        published_post_id: publishedPost.id,
                        views: insights.views || insights.impressions || insights.reach || 0,
                        likes: insights.likes || 0,
                        comments: insights.comments || 0,
                        shares: insights.shares || 0,
                        saves: insights.saved || insights.saves || 0,
                        engagement_rate: insights.total_interactions || 0,
                        synced_at: new Date().toISOString()
                    };

                    console.log(`[Sync] Upserting analytics for post ${publishedPost.id}`);

                    const { data: upsertResult, error: upsertError } = await supabase
                        .from('post_analytics')
                        .upsert(analyticsData, {
                            onConflict: 'published_post_id'
                        });

                    if (upsertError) {
                        console.error(`[Sync] Failed to upsert analytics for post ${publishedPost.id}:`, redactSensitiveLogValue(upsertError));
                        throw upsertError;
                    }

                    console.log(`[Sync] Successfully synced post ${publishedPost.id}`);
                    syncedCount++;
                } else {
                    console.log(`[Sync] No insights returned for post ${publishedPost.id}`);
                }
            } catch (error) {
                console.error(`Error syncing insights for post ${publishedPost.id}: ${summarizeError(error)}`);
            }
        }
    }

    // Also sync direct/native platform posts (not created in app) so analytics stays source-agnostic.
    for (const account of decryptedAccounts) {
        if (!account.access_token) continue;
        if (!canReadAnalyticsWithMetaAccount(account.metadata)) continue;

        try {
            if (account.platform === 'instagram') {
                const igUserId = account.account_id || account.metadata?.instagram_business_account_id;
                if (!igUserId) {
                    console.log(`[Sync] Instagram account ${account.id} missing account_id, skipping direct sync`);
                    continue;
                }

                // Keep list call on safe fields, then fetch optional counts per media.
                const listUrl = `${META_GRAPH_URL}/${igUserId}/media?fields=id,caption,timestamp,permalink,media_type&limit=50&access_token=${account.access_token}`;
                const listRes = await fetch(listUrl);
                const listData = await listRes.json();

                if (!listRes.ok) {
                    directErrorCount++;
                    logMetaGraphWarning('[Sync] Instagram media list request failed', listData);
                    continue;
                }

                const mediaItems = Array.isArray(listData?.data) ? listData.data : [];
                console.log(`[Sync] Instagram direct media fetched: ${mediaItems.length} items for account ${account.id}`);

                for (const media of mediaItems) {
                    try {
                        let likes = 0;
                        let comments = 0;
                        let permalink = media.permalink || null;
                        let publishedAt = media.timestamp || null;
                        let caption = media.caption || null;
                        let mediaType = media.media_type || null;
                        let views = 0;
                        let saves = 0;
                        let shares = 0;

                        try {
                            const detailUrl = `${META_GRAPH_URL}/${media.id}?fields=like_count,comments_count,caption,timestamp,permalink,media_type&access_token=${account.access_token}`;
                            const detailRes = await fetch(detailUrl);
                            const detailData = await detailRes.json();

                            if (detailRes.ok) {
                                likes = detailData.like_count || 0;
                                comments = detailData.comments_count || 0;
                                permalink = detailData.permalink || permalink;
                                publishedAt = detailData.timestamp || publishedAt;
                                caption = detailData.caption || caption;
                                mediaType = detailData.media_type || mediaType;
                            } else {
                                logMetaGraphWarning(`[Sync] Instagram media details unavailable for ${media.id}`, detailData);
                            }
                        } catch (detailError) {
                            console.log(`[Sync] Instagram media details fetch failed for ${media.id}: ${summarizeError(detailError)}`);
                        }

                        try {
                            const igInsights = await fetchInstagramMediaInsightsBestEffort(media.id, account.access_token, mediaType || undefined);
                            views = igInsights.views || 0;
                            saves = igInsights.saved || 0;
                            shares = igInsights.shares || 0;
                        } catch (insightsError) {
                            console.log(`[Sync] Instagram media insights fetch failed for ${media.id}: ${summarizeError(insightsError)}`);
                        }

                        const published = await upsertPublishedPost({
                            platform: 'instagram',
                            platform_post_id: media.id,
                            permalink,
                            published_at: publishedAt,
                            social_account_id: account.id,
                            platform_caption: caption,
                        });
                        directPublishedCount++;

                        try {
                            await upsertPostAnalytics(published.id, {
                                likes,
                                comments,
                                views,
                                shares,
                                saves,
                                engagement_rate: 0,
                            });
                            directMetricsCount++;
                        } catch (analyticsError) {
                            directErrorCount++;
                            console.error(`[Sync] Failed upserting IG analytics for ${media.id}: ${summarizeError(analyticsError)}`);
                        }

                        syncedCount++;
                    } catch (itemError) {
                        directErrorCount++;
                        console.error(`[Sync] Failed syncing Instagram media item: ${summarizeError(itemError)}`);
                    }
                }
            } else if (account.platform === 'facebook') {
                const pageId = account.metadata?.connected_page_id || account.account_id;
                if (!pageId) {
                    console.log(`[Sync] Facebook account ${account.id} missing page id, skipping direct sync`);
                    continue;
                }

                // Request minimal fields first so posts are still ingested even without insights permissions.
                const listUrl = `${META_GRAPH_URL}/${pageId}/posts?fields=id,message,created_time,permalink_url&limit=50&access_token=${account.access_token}`;
                const listRes = await fetch(listUrl);
                const listData = await listRes.json();

                if (!listRes.ok) {
                    directErrorCount++;
                    logMetaGraphWarning('[Sync] Facebook posts list request failed', listData);
                    continue;
                }

                const postItems = Array.isArray(listData?.data) ? listData.data : [];
                console.log(`[Sync] Facebook direct posts fetched: ${postItems.length} items for account ${account.id}`);

                for (const fbPost of postItems) {
                    try {
                        let likes = 0;
                        let comments = 0;
                        let shares = 0;
                        let views = 0;

                        try {
                            const metricsUrl = `${META_GRAPH_URL}/${fbPost.id}?fields=shares,likes.summary(true),comments.summary(true)&access_token=${account.access_token}`;
                            const metricsRes = await fetch(metricsUrl);
                            const metricsData = await metricsRes.json();

                            if (metricsRes.ok) {
                                likes = metricsData?.likes?.summary?.total_count || 0;
                                comments = metricsData?.comments?.summary?.total_count || 0;
                                shares = metricsData?.shares?.count || 0;
                            } else {
                                logMetaGraphWarning(`[Sync] Facebook metrics unavailable for ${fbPost.id}`, metricsData);
                            }
                        } catch (metricsError) {
                            console.log(`[Sync] Facebook metrics fetch failed for ${fbPost.id}: ${summarizeError(metricsError)}`);
                        }

                        try {
                            const fbInsights = await fetchFacebookPostInsightsBestEffort(fbPost.id, account.access_token);
                            views = fbInsights.views || 0;
                        } catch (insightsError) {
                            console.log(`[Sync] Facebook insights fetch failed for ${fbPost.id}: ${summarizeError(insightsError)}`);
                        }

                        const published = await upsertPublishedPost({
                            platform: 'facebook',
                            platform_post_id: fbPost.id,
                            permalink: fbPost.permalink_url || null,
                            published_at: fbPost.created_time || null,
                            social_account_id: account.id,
                            platform_caption: fbPost.message || null,
                        });
                        directPublishedCount++;

                        try {
                            await upsertPostAnalytics(published.id, {
                                likes,
                                comments,
                                shares,
                                views,
                                saves: 0,
                                engagement_rate: 0,
                            });
                            directMetricsCount++;
                        } catch (analyticsError) {
                            directErrorCount++;
                            console.error(`[Sync] Failed upserting FB analytics for ${fbPost.id}: ${summarizeError(analyticsError)}`);
                        }

                        syncedCount++;
                    } catch (itemError) {
                        directErrorCount++;
                        console.error(`[Sync] Failed syncing Facebook post item: ${summarizeError(itemError)}`);
                    }
                }
            }
        } catch (accountError) {
            directErrorCount++;
            console.error(`[Sync] Direct sync failed for account ${account.id}: ${summarizeError(accountError)}`);
        }
    }

    console.log(`[Sync] Direct/native sync summary: posts_upserted=${directPublishedCount}, metrics_upserted=${directMetricsCount}, errors=${directErrorCount}`);

    return {
        synced: syncedCount,
        direct: {
            posts_upserted: directPublishedCount,
            metrics_upserted: directMetricsCount,
            errors: directErrorCount
        }
    };
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
        console.error(`[AccountSync] Error fetching accounts:`, redactSensitiveLogValue(accountsError));
        return { synced: 0, error: accountsError.message };
    }

    if (!accounts || accounts.length === 0) {
        console.log(`[AccountSync] No social accounts found`);
        return { synced: 0, message: 'No social accounts found' };
    }
    const decryptedAccounts = await Promise.all(accounts.map((account: any) => decryptMetaAccountRow(account)));

    console.log(`[AccountSync] Found ${decryptedAccounts.length} social accounts`);

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    let syncedCount = 0;

    for (const account of decryptedAccounts) {
        if (!account.access_token) {
            console.log(`[AccountSync] Account ${account.id} (${account.platform}) has no access token, skipping`);
            continue;
        }

        if (!canReadAnalyticsWithMetaAccount(account.metadata)) {
            console.log(`[AccountSync] Account ${account.id} (${account.platform}) lacks analytics capability, skipping`);
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
                    console.log(`[AccountSync] Instagram account data fetched for ${igUserId}`);
                    accountData = {
                        followers: data.followers_count || 0,
                        following: data.follows_count || 0,
                        posts_count: data.media_count || 0
                    };
                } else {
                    logMetaGraphWarning(`[AccountSync] Instagram account request failed for ${igUserId}`, data);
                }
            } else if (account.platform === 'facebook') {
                // Facebook: GET /{page-id}?fields=fan_count,followers_count
                const pageId = account.account_id;
                const url = `${META_GRAPH_URL}/${pageId}?fields=fan_count,followers_count&access_token=${account.access_token}`;

                console.log(`[AccountSync] Fetching Facebook page data for ${pageId}`);

                const response = await fetch(url);
                const data = await response.json();

                if (response.ok) {
                    console.log(`[AccountSync] Facebook page data fetched for ${pageId}`);
                    accountData = {
                        followers: data.followers_count || data.fan_count || 0,
                        following: 0, // Pages don't follow other pages
                        posts_count: 0 // Would need separate API call
                    };
                } else {
                    logMetaGraphWarning(`[AccountSync] Facebook page request failed for ${pageId}`, data);
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

                console.log(`[AccountSync] Upserting account analytics for ${account.id}`);

                const { error: upsertError } = await supabase
                    .from('account_analytics')
                    .upsert(analyticsRecord, {
                        onConflict: 'social_account_id,date'
                    });

                if (upsertError) {
                    console.error(`[AccountSync] Failed to upsert account analytics for ${account.id}: ${summarizeError(upsertError)}`);
                } else {
                    console.log(`[AccountSync] Successfully synced account ${account.id}`);
                    syncedCount++;
                }
            }
        } catch (error) {
            console.error(`[AccountSync] Error syncing account ${account.id}: ${summarizeError(error)}`);
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
        console.error('Sync analytics error:', redactSensitiveLogValue(error));
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
