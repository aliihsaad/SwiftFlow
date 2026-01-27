/**
 * Meta API Client for Analytics
 * Fetches insights from Facebook Pages and Instagram Business Accounts
 */

const META_GRAPH_URL = 'https://graph.facebook.com/v24.0';

export interface InstagramInsights {
    impressions: number;
    reach: number;
    profile_views: number;
    follower_count: number;
    engagement: number;
}

export interface FacebookInsights {
    page_impressions: number;
    page_engaged_users: number;
    page_fans: number;
    page_views: number;
}

export interface PostInsights {
    post_id: string;
    platform: 'instagram' | 'facebook';
    impressions?: number;
    reach?: number;
    engagement?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
}

/**
 * Fetch Instagram account insights
 */
export async function fetchInstagramInsights(
    igAccountId: string,
    accessToken: string,
    since?: number,
    until?: number
): Promise<InstagramInsights> {
    try {
        const metrics = [
            'impressions',
            'reach',
            'profile_views',
            'follower_count'
        ].join(',');

        const params = new URLSearchParams({
            metric: metrics,
            period: 'day',
            access_token: accessToken
        });

        if (since) params.append('since', since.toString());
        if (until) params.append('until', until.toString());

        const response = await fetch(
            `${META_GRAPH_URL}/${igAccountId}/insights?${params.toString()}`
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('[Meta API] Instagram insights error:', error);
            throw new Error(error.error?.message || 'Failed to fetch Instagram insights');
        }

        const data = await response.json();

        // Transform the response
        const insights: InstagramInsights = {
            impressions: 0,
            reach: 0,
            profile_views: 0,
            follower_count: 0,
            engagement: 0
        };

        data.data?.forEach((metric: any) => {
            const value = metric.values?.[0]?.value || 0;
            if (metric.name in insights) {
                insights[metric.name as keyof InstagramInsights] = value;
            }
        });

        return insights;
    } catch (error) {
        console.error('[Meta API] fetchInstagramInsights error:', error);
        throw error;
    }
}

/**
 * Fetch Facebook Page insights
 */
export async function fetchFacebookPageInsights(
    pageId: string,
    accessToken: string,
    since?: number,
    until?: number
): Promise<FacebookInsights> {
    try {
        const metrics = [
            'page_impressions',
            'page_engaged_users',
            'page_fans',
            'page_views_total'
        ].join(',');

        const params = new URLSearchParams({
            metric: metrics,
            period: 'day',
            access_token: accessToken
        });

        if (since) params.append('since', since.toString());
        if (until) params.append('until', until.toString());

        const response = await fetch(
            `${META_GRAPH_URL}/${pageId}/insights?${params.toString()}`
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('[Meta API] Facebook insights error:', error);
            throw new Error(error.error?.message || 'Failed to fetch Facebook insights');
        }

        const data = await response.json();

        // Transform the response
        const insights: FacebookInsights = {
            page_impressions: 0,
            page_engaged_users: 0,
            page_fans: 0,
            page_views: 0
        };

        data.data?.forEach((metric: any) => {
            const value = metric.values?.[0]?.value || 0;
            if (metric.name === 'page_views_total') {
                insights.page_views = value;
            } else if (metric.name in insights) {
                insights[metric.name as keyof FacebookInsights] = value;
            }
        });

        return insights;
    } catch (error) {
        console.error('[Meta API] fetchFacebookPageInsights error:', error);
        throw error;
    }
}

/**
 * Fetch Instagram post insights
 */
export async function fetchInstagramPostInsights(
    mediaId: string,
    accessToken: string
): Promise<PostInsights> {
    try {
        const metrics = [
            'impressions',
            'reach',
            'engagement',
            'likes',
            'comments',
            'saves'
        ].join(',');

        const params = new URLSearchParams({
            metric: metrics,
            access_token: accessToken
        });

        const response = await fetch(
            `${META_GRAPH_URL}/${mediaId}/insights?${params.toString()}`
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('[Meta API] Instagram post insights error:', error);
            throw new Error(error.error?.message || 'Failed to fetch Instagram post insights');
        }

        const data = await response.json();

        const insights: PostInsights = {
            post_id: mediaId,
            platform: 'instagram',
            impressions: 0,
            reach: 0,
            engagement: 0,
            likes: 0,
            comments: 0,
            saves: 0
        };

        data.data?.forEach((metric: any) => {
            const value = metric.values?.[0]?.value || 0;
            if (metric.name in insights) {
                insights[metric.name as keyof PostInsights] = value;
            }
        });

        return insights;
    } catch (error) {
        console.error('[Meta API] fetchInstagramPostInsights error:', error);
        throw error;
    }
}

/**
 * Fetch Facebook post insights
 */
export async function fetchFacebookPostInsights(
    postId: string,
    accessToken: string
): Promise<PostInsights> {
    try {
        const params = new URLSearchParams({
            fields: 'impressions,reach,engagement,likes.summary(true),comments.summary(true),shares',
            access_token: accessToken
        });

        const response = await fetch(
            `${META_GRAPH_URL}/${postId}?${params.toString()}`
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('[Meta API] Facebook post insights error:', error);
            throw new Error(error.error?.message || 'Failed to fetch Facebook post insights');
        }

        const data = await response.json();

        const insights: PostInsights = {
            post_id: postId,
            platform: 'facebook',
            impressions: data.impressions || 0,
            reach: data.reach || 0,
            engagement: data.engagement || 0,
            likes: data.likes?.summary?.total_count || 0,
            comments: data.comments?.summary?.total_count || 0,
            shares: data.shares?.count || 0
        };

        return insights;
    } catch (error) {
        console.error('[Meta API] fetchFacebookPostInsights error:', error);
        throw error;
    }
}

/**
 * Get date range timestamps for API queries
 */
export function getDateRangeTimestamps(range: 'last_7_days' | 'last_30_days' | 'last_90_days') {
    const now = Date.now();
    const dayInMs = 24 * 60 * 60 * 1000;

    const ranges = {
        last_7_days: 7,
        last_30_days: 30,
        last_90_days: 90
    };

    const days = ranges[range];
    const since = Math.floor((now - (days * dayInMs)) / 1000);
    const until = Math.floor(now / 1000);

    return { since, until };
}
