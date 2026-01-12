import { InstagramInsight, FacebookInsight, InstagramMedia, FacebookPost } from '@/types/analytics'

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0'

interface MetaAPIConfig {
    facebookPageId?: string
    facebookAccessToken?: string
    instagramUserId?: string
    instagramAccessToken?: string
}

export class MetaAPIClient {
    private config: MetaAPIConfig

    constructor(config: MetaAPIConfig) {
        this.config = config
    }

    /**
     * Fetch Instagram insights for a given time period
     */
    async fetchInstagramInsights(
        metrics: string[],
        since: number,
        until: number
    ): Promise<InstagramInsight[]> {
        if (!this.config.instagramUserId || !this.config.instagramAccessToken) {
            throw new Error('Instagram credentials not configured')
        }

        const metricsParam = metrics.join(',')
        const url = `${GRAPH_API_BASE}/${this.config.instagramUserId}/insights?metric=${metricsParam}&period=day&since=${since}&until=${until}&access_token=${this.config.instagramAccessToken}`

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Instagram API error: ${response.statusText}`)
        }

        const data = await response.json()
        return data.data || []
    }

    /**
     * Fetch Instagram media posts with metrics
     */
    async fetchInstagramMedia(limit = 50): Promise<InstagramMedia[]> {
        if (!this.config.instagramUserId || !this.config.instagramAccessToken) {
            throw new Error('Instagram credentials not configured')
        }

        const fields = 'id,caption,like_count,comments_count,media_type,media_url,timestamp,insights.metric(impressions,reach,saved)'
        const url = `${GRAPH_API_BASE}/${this.config.instagramUserId}/media?fields=${fields}&limit=${limit}&access_token=${this.config.instagramAccessToken}`

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Instagram Media API error: ${response.statusText}`)
        }

        const data = await response.json()
        return data.data || []
    }

    /**
     * Fetch Facebook page insights
     */
    async fetchFacebookInsights(
        metrics: string[],
        since: number,
        until: number
    ): Promise<FacebookInsight[]> {
        if (!this.config.facebookPageId || !this.config.facebookAccessToken) {
            throw new Error('Facebook credentials not configured')
        }

        const metricsParam = metrics.join(',')
        const url = `${GRAPH_API_BASE}/${this.config.facebookPageId}/insights?metric=${metricsParam}&period=day&since=${since}&until=${until}&access_token=${this.config.facebookAccessToken}`

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Facebook API error: ${response.statusText}`)
        }

        const data = await response.json()
        return data.data || []
    }

    /**
     * Fetch Facebook posts with engagement metrics
     */
    async fetchFacebookPosts(limit = 50): Promise<FacebookPost[]> {
        if (!this.config.facebookPageId || !this.config.facebookAccessToken) {
            throw new Error('Facebook credentials not configured')
        }

        const fields = 'id,message,created_time,shares.summary(true),insights.metric(post_impressions,post_engaged_users)'
        const url = `${GRAPH_API_BASE}/${this.config.facebookPageId}/posts?fields=${fields}&limit=${limit}&access_token=${this.config.facebookAccessToken}`

        const response = await fetch(url)
        if (!response.ok) {
            throw new Error(`Facebook Posts API error: ${response.statusText}`)
        }

        const data = await response.json()
        return data.data || []
    }

    /**
     * Get current follower counts
     */
    async getFollowerCounts(): Promise<{ facebook: number; instagram: number }> {
        const counts = { facebook: 0, instagram: 0 }

        try {
            if (this.config.facebookPageId && this.config.facebookAccessToken) {
                const url = `${GRAPH_API_BASE}/${this.config.facebookPageId}?fields=fan_count&access_token=${this.config.facebookAccessToken}`
                const response = await fetch(url)
                if (response.ok) {
                    const data = await response.json()
                    counts.facebook = data.fan_count || 0
                }
            }
        } catch (error) {
            console.error('Error fetching Facebook follower count:', error)
        }

        try {
            if (this.config.instagramUserId && this.config.instagramAccessToken) {
                const url = `${GRAPH_API_BASE}/${this.config.instagramUserId}?fields=followers_count&access_token=${this.config.instagramAccessToken}`
                const response = await fetch(url)
                if (response.ok) {
                    const data = await response.json()
                    counts.instagram = data.followers_count || 0
                }
            }
        } catch (error) {
            console.error('Error fetching Instagram follower count:', error)
        }

        return counts
    }
}

/**
 * Create MetaAPIClient from environment variables
 */
export function createMetaAPIClient(): MetaAPIClient {
    return new MetaAPIClient({
        facebookPageId: process.env.FACEBOOK_PAGE_ID,
        facebookAccessToken: process.env.FACEBOOK_ACCESS_TOKEN,
        instagramUserId: process.env.INSTAGRAM_USER_ID,
        instagramAccessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    })
}
