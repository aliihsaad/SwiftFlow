export type DateRange = 'last_7_days' | 'last_30_days' | 'last_90_days'
export type Granularity = 'daily' | 'weekly' | 'monthly'
export type Platform = 'facebook' | 'instagram'
export type AnalyticsPlatformView = 'all' | Platform

export interface PostData {
    id: string
    platform: Platform
    timeAgo: string
    caption: string
    likes: number
    comments: number
    shares: number
    views: number
    timestamp: string
}

export interface KPIData {
    value: number
    changePct: number
    display?: string
}

export interface FollowersKPIData extends KPIData {
    facebook: number
    instagram: number
}

export interface FollowerGrowthData {
    labels: string[]
    values: number[]
    facebookValues: number[]
    instagramValues: number[]
    bestDay: string
    avgDaily: string
    totalGain: string
}

export interface AccountAnalytics {
    totalReach: number
    totalEngagement: number
    followers: number
    facebookFollowers: number
    instagramFollowers: number
}

export interface AnalyticsResponse {
    kpis: {
        engagement: KPIData
        views: KPIData
        followers: FollowersKPIData
        growthRate: KPIData
    }
    followerGrowth: FollowerGrowthData
    latestPost: PostData | null
    accountAnalytics: AccountAnalytics
    otherPosts: PostData[]
    _meta?: {
        hasAnalytics: boolean
        needsSync: boolean
        hasPublishedPosts?: boolean
        reason?: string | null
        selectedPlatform?: AnalyticsPlatformView
        isCombinedView?: boolean
        warnings?: string[]
        suspectedMissingPermissions?: string[]
        platformStatuses?: Array<{
            platform: 'instagram' | 'facebook'
            connected: boolean
            status: 'available' | 'partial' | 'unavailable'
            accountMetricsStatus: 'available' | 'partial' | 'unavailable'
            postMetricsStatus: 'available' | 'partial' | 'unavailable'
            exactScopesKnown: boolean
            missingPermissions: string[]
            warnings: string[]
        }>
        capabilities?: {
            accountMetrics: {
                status: 'available' | 'partial' | 'unavailable'
                availablePlatforms: string[]
                unavailablePlatforms: string[]
            }
            postMetrics: {
                status: 'available' | 'partial' | 'unavailable'
                totalPublishedPosts: number
                postsWithAnalyticsRows: number
                platformsWithPublishedPosts: string[]
                platformsWithAnalyticsRows: string[]
            }
        }
    }
}

// Meta API Response Types
export interface InstagramInsight {
    name: string
    period: string
    values: Array<{
        value: number
        end_time: string
    }>
}

export interface FacebookInsight {
    name: string
    period: string
    values: Array<{
        value: number
        end_time: string
    }>
}

export interface InstagramMedia {
    id: string
    caption?: string
    like_count: number
    comments_count: number
    media_type: string
    media_url: string
    timestamp: string
    insights?: {
        data: Array<{
            name: string
            values: Array<{ value: number }>
        }>
    }
}

export interface FacebookPost {
    id: string
    message?: string
    created_time: string
    shares?: {
        count: number
    }
    insights?: {
        data: Array<{
            name: string
            values: Array<{ value: number }>
        }>
    }
}
