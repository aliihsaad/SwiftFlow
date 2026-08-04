export type DateRange = 'last_7_days' | 'last_30_days' | 'last_90_days'
export type Granularity = 'daily' | 'weekly' | 'monthly'
export type Platform = 'instagram'
export type AnalyticsPlatformView = 'instagram'
export type AnalyticsMetricStatus = 'available' | 'partial' | 'unavailable'

export interface AnalyticsPlatformStatus {
    platform: Platform
    connected: boolean
    status: AnalyticsMetricStatus
    accountMetricsStatus: AnalyticsMetricStatus
    postMetricsStatus: AnalyticsMetricStatus
    exactScopesKnown: boolean
    missingPermissions: string[]
    warnings: string[]
}

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
    instagram: number
}

export interface FollowerGrowthData {
    labels: string[]
    values: number[]
    instagramValues: number[]
    bestDay: string
    avgDaily: string
    totalGain: string
}

export interface AccountAnalytics {
    totalReach: number
    totalEngagement: number
    followers: number
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
        isCombinedView?: false
        warnings?: string[]
        suspectedMissingPermissions?: string[]
        platformStatuses?: AnalyticsPlatformStatus[]
        capabilities?: {
            accountMetrics: {
                status: AnalyticsMetricStatus
                availablePlatforms: string[]
                unavailablePlatforms: string[]
            }
            postMetrics: {
                status: AnalyticsMetricStatus
                totalPublishedPosts: number
                postsWithAnalyticsRows: number
                platformsWithPublishedPosts: string[]
                platformsWithAnalyticsRows: string[]
            }
        }
        contentDiscovery?: {
            byPlatform: Array<{
                platform: Platform
                totalSyncedPosts: number
                appManagedPosts: number
                discoveredNativePosts: number
                latestPublishedAt: string | null
                topPost: {
                    id: string
                    caption: string
                    permalink: string | null
                    likes: number
                    comments: number
                    shares: number
                    views: number
                    source: 'app_managed' | 'native_discovered'
                } | null
            }>
        }
    }
}

export interface InstagramInsight {
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
