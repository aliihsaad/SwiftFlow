import { NextRequest, NextResponse } from 'next/server'
import { DateRange, Granularity, AnalyticsResponse, PostData, Platform, AnalyticsPlatformView } from '@/types/analytics'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { format, subDays, formatDistanceToNow } from 'date-fns'

export const runtime = 'edge'

type MetricStatus = 'available' | 'partial' | 'unavailable'
type PlatformKey = 'instagram' | 'facebook'

type PlatformAnalyticsMeta = {
    platform: PlatformKey
    connected: boolean
    status: MetricStatus
    accountMetricsStatus: MetricStatus
    postMetricsStatus: MetricStatus
    exactScopesKnown: boolean
    missingPermissions: string[]
    warnings: string[]
}

type AnalyticsMeta = {
    hasAnalytics: boolean
    needsSync: boolean
    hasPublishedPosts?: boolean
    reason?: string | null
    selectedPlatform?: AnalyticsPlatformView
    isCombinedView?: boolean
    warnings?: string[]
    suspectedMissingPermissions?: string[]
    platformStatuses?: PlatformAnalyticsMeta[]
    capabilities?: {
        accountMetrics: {
            status: MetricStatus
            availablePlatforms: string[]
            unavailablePlatforms: string[]
        }
        postMetrics: {
            status: MetricStatus
            totalPublishedPosts: number
            postsWithAnalyticsRows: number
            platformsWithPublishedPosts: string[]
            platformsWithAnalyticsRows: string[]
        }
    }
}

function buildAnalyticsMeta(params: {
    socialAccounts: any[]
    accountAnalytics: any[]
    publishedPosts: any[]
    postAnalytics: any[]
    hasAnalytics: boolean
    hasPublishedPosts: boolean
    needsSync: boolean
    reason?: string | null
    selectedPlatform?: AnalyticsPlatformView
}): AnalyticsMeta {
    const {
        socialAccounts,
        accountAnalytics,
        publishedPosts,
        postAnalytics,
        hasAnalytics,
        hasPublishedPosts,
        needsSync,
        reason = null,
        selectedPlatform = 'all',
    } = params

    const warnings: string[] = []
    const suspectedMissingPermissions = new Set<string>()
    const platformStatuses: PlatformAnalyticsMeta[] = []

    const connectedPlatforms = Array.from(new Set((socialAccounts || []).map((a) => a.platform).filter(Boolean)))
    const accountIdToPlatform = new Map<string, string>()
    const accountIdToGrantedScopes = new Map<string, Set<string>>()
    const platformGrantedScopes = new Map<string, Set<string>>()
    const platformExactScopesKnown = new Map<string, boolean>()
    ;(socialAccounts || []).forEach((a) => {
        if (a?.id) accountIdToPlatform.set(a.id, a.platform)
        const rawScopes = Array.isArray(a?.metadata?.granted_scopes)
            ? a.metadata.granted_scopes.filter((s: unknown) => typeof s === 'string')
            : []
        const scopeSet = new Set<string>(rawScopes)
        if (a?.id) accountIdToGrantedScopes.set(a.id, scopeSet)
        if (a?.platform) {
            const existing = platformGrantedScopes.get(a.platform) || new Set<string>()
            rawScopes.forEach((s: string) => existing.add(s))
            platformGrantedScopes.set(a.platform, existing)
            if (Array.isArray(a?.metadata?.granted_scopes)) {
                platformExactScopesKnown.set(a.platform, true)
            } else if (!platformExactScopesKnown.has(a.platform)) {
                platformExactScopesKnown.set(a.platform, false)
            }
        }
    })

    const getPlatformScopeState = (platform: PlatformKey, scope: string): 'granted' | 'missing' | 'unknown' => {
        const exactKnown = platformExactScopesKnown.get(platform)
        if (!exactKnown) return 'unknown'
        return (platformGrantedScopes.get(platform)?.has(scope)) ? 'granted' : 'missing'
    }

    const noteRequiredPermission = (platform: PlatformKey, scope: string) => {
        const state = getPlatformScopeState(platform, scope)
        if (state === 'missing' || state === 'unknown') {
            suspectedMissingPermissions.add(scope)
        }
    }

    const accountMetricPlatforms = new Set<string>()
    ;(accountAnalytics || []).forEach((row) => {
        const platform = accountIdToPlatform.get(row.social_account_id)
        if (platform) accountMetricPlatforms.add(platform)
    })

    const publishedPostIdToPlatform = new Map<string, string>()
    const platformsWithPublishedPosts = new Set<string>()
    ;(publishedPosts || []).forEach((pp) => {
        if (pp?.id && pp?.platform) {
            publishedPostIdToPlatform.set(pp.id, pp.platform)
            platformsWithPublishedPosts.add(pp.platform)
        }
    })

    const platformsWithAnalyticsRows = new Set<string>()
    ;(postAnalytics || []).forEach((row) => {
        const platform = publishedPostIdToPlatform.get(row.published_post_id)
        if (platform) platformsWithAnalyticsRows.add(platform)
    })

    const accountUnavailablePlatforms = connectedPlatforms.filter((p) => !accountMetricPlatforms.has(p))
    const accountStatus: MetricStatus =
        connectedPlatforms.length === 0
            ? 'unavailable'
            : accountMetricPlatforms.size === 0
                ? 'unavailable'
                : accountMetricPlatforms.size < connectedPlatforms.length
                    ? 'partial'
                    : 'available'

    if (accountStatus !== 'available' && connectedPlatforms.length > 0) {
        warnings.push('Account-level analytics is partially available. Follower metrics may be missing for some connected platforms.')
        if (connectedPlatforms.includes('instagram')) noteRequiredPermission('instagram', 'instagram_manage_insights')
        if (connectedPlatforms.includes('facebook')) noteRequiredPermission('facebook', 'pages_read_engagement')
    }

    const totalPublishedPosts = (publishedPosts || []).length
    const postsWithAnalyticsRows = new Set((postAnalytics || []).map((row) => row.published_post_id)).size
    const rowsWithAnyEngagement = (postAnalytics || []).filter((row) => {
        const likes = Number(row?.likes || 0)
        const comments = Number(row?.comments || 0)
        const shares = Number(row?.shares || 0)
        const saves = Number(row?.saves || 0)
        return likes + comments + shares + saves > 0
    }).length
    const rowsWithViews = (postAnalytics || []).filter((row) => Number(row?.views || 0) > 0).length
    const rowsWithSaves = (postAnalytics || []).filter((row) => Number(row?.saves || 0) > 0).length
    let postStatus: MetricStatus =
        totalPublishedPosts === 0
            ? 'unavailable'
            : postsWithAnalyticsRows === 0
                ? 'unavailable'
                : postsWithAnalyticsRows < totalPublishedPosts
                    ? 'partial'
                    : 'available'

    if (hasPublishedPosts && postStatus !== 'available') {
        warnings.push('Post analytics is partial. Some posts were found without synced metrics.')
        if (platformsWithPublishedPosts.has('instagram')) noteRequiredPermission('instagram', 'instagram_manage_insights')
        if (platformsWithPublishedPosts.has('facebook')) noteRequiredPermission('facebook', 'pages_read_engagement')
    }

    // Heuristic: analytics rows exist, but key insights metrics are missing.
    // This commonly happens when posts are ingested but reach/views/saves insights are unavailable.
    if (postsWithAnalyticsRows > 0 && rowsWithAnyEngagement > 0 && rowsWithViews === 0) {
        if (postStatus === 'available') postStatus = 'partial';
        const igScopeState = getPlatformScopeState('instagram', 'instagram_manage_insights')
        const fbScopeState = getPlatformScopeState('facebook', 'pages_read_engagement')
        const hasExactGrantedInsights =
            (platformsWithPublishedPosts.has('instagram') && igScopeState === 'granted') ||
            (platformsWithPublishedPosts.has('facebook') && fbScopeState === 'granted')

        warnings.push(
            hasExactGrantedInsights
                ? 'Post engagement counts are available, but view/reach metrics are still missing for some posts (API/media-type limitations or unsupported metrics).'
                : 'Post engagement counts are available, but view/reach metrics are missing or zero. Insights permissions may be unavailable.'
        )
        if (platformsWithPublishedPosts.has('instagram')) noteRequiredPermission('instagram', 'instagram_manage_insights')
        if (platformsWithPublishedPosts.has('facebook')) noteRequiredPermission('facebook', 'pages_read_engagement')
    }

    if (platformsWithPublishedPosts.has('instagram') && postsWithAnalyticsRows > 0 && rowsWithSaves === 0) {
        if (postStatus === 'available') postStatus = 'partial';
        const igScopeState = getPlatformScopeState('instagram', 'instagram_manage_insights')
        warnings.push(
            igScopeState === 'granted'
                ? 'Instagram save/reach-style insights are still unavailable for current synced posts (likely media-type or API limitations).'
                : 'Instagram save/reach-style insights appear unavailable for current synced posts.'
        )
        noteRequiredPermission('instagram', 'instagram_manage_insights')
    }

    if (reason === 'no_published_posts') {
        warnings.push('No published posts were found for the selected workspace. Account analytics may still be available.')
    }

    const analyticsRowsByPlatform = new Map<string, any[]>()
    ;(postAnalytics || []).forEach((row) => {
        const platform = publishedPostIdToPlatform.get(row.published_post_id)
        if (!platform) return
        const list = analyticsRowsByPlatform.get(platform) || []
        list.push(row)
        analyticsRowsByPlatform.set(platform, list)
    })

    ;(['instagram', 'facebook'] as PlatformKey[]).forEach((platform: PlatformKey) => {
        const connected = connectedPlatforms.includes(platform)
        if (!connected) return

        const platformPublishedRows = (publishedPosts || []).filter((pp) => pp?.platform === platform)
        const platformAnalyticsRows = analyticsRowsByPlatform.get(platform) || []
        const platformRowsWithAnyEngagement = platformAnalyticsRows.filter((row) => {
            const likes = Number(row?.likes || 0)
            const comments = Number(row?.comments || 0)
            const shares = Number(row?.shares || 0)
            const saves = Number(row?.saves || 0)
            return likes + comments + shares + saves > 0
        }).length
        const platformRowsWithViews = platformAnalyticsRows.filter((row) => Number(row?.views || 0) > 0).length
        const platformRowsWithSaves = platformAnalyticsRows.filter((row) => Number(row?.saves || 0) > 0).length
        const platformAccountMetricsRows = (accountAnalytics || []).filter((row) => accountIdToPlatform.get(row.social_account_id) === platform)

        const accountMetricsStatus: MetricStatus =
            platformAccountMetricsRows.length === 0 ? 'unavailable' : 'available'

        let postMetricsStatus: MetricStatus =
            platformPublishedRows.length === 0
                ? 'unavailable'
                : platformAnalyticsRows.length === 0
                    ? 'unavailable'
                    : platformAnalyticsRows.length < platformPublishedRows.length
                        ? 'partial'
                        : 'available'

        const platformWarnings: string[] = []
        const missingPermissions: string[] = []
        const exactScopesKnown = !!platformExactScopesKnown.get(platform)

        if (platform === 'instagram') {
            const scopeState = getPlatformScopeState('instagram', 'instagram_manage_insights')
            if (scopeState === 'missing') missingPermissions.push('instagram_manage_insights')

            if (platformPublishedRows.length > 0 && platformRowsWithAnyEngagement > 0 && platformRowsWithViews === 0) {
                if (postMetricsStatus === 'available') postMetricsStatus = 'partial'
                platformWarnings.push(
                    scopeState === 'granted'
                        ? 'Views/reach are missing for some Instagram posts (Meta API/media-type limitation).'
                        : 'Views/reach may require Instagram insights permission.'
                )
            }
            if (platformPublishedRows.length > 0 && platformAnalyticsRows.length > 0 && platformRowsWithSaves === 0) {
                if (postMetricsStatus === 'available') postMetricsStatus = 'partial'
                platformWarnings.push(
                    scopeState === 'granted'
                        ? 'Save metrics are unavailable for current Instagram posts.'
                        : 'Save metrics may require Instagram insights permission.'
                )
            }
            if (accountMetricsStatus === 'unavailable') {
                platformWarnings.push(
                    scopeState === 'granted'
                        ? 'Instagram follower/account metrics are not yet available.'
                        : 'Instagram follower/account metrics may require Instagram insights permission.'
                )
            }
        } else if (platform === 'facebook') {
            const scopeState = getPlatformScopeState('facebook', 'pages_read_engagement')
            if (scopeState === 'missing') missingPermissions.push('pages_read_engagement')

            if (platformPublishedRows.length > 0 && platformRowsWithAnyEngagement > 0 && platformRowsWithViews === 0) {
                if (postMetricsStatus === 'available') postMetricsStatus = 'partial'
                platformWarnings.push(
                    scopeState === 'granted'
                        ? 'Facebook post view/reach metrics are unavailable for current synced posts.'
                        : 'Facebook post view/reach metrics may require pages_read_engagement.'
                )
            }
            if (accountMetricsStatus === 'unavailable') {
                platformWarnings.push(
                    scopeState === 'granted'
                        ? 'Facebook follower/page metrics are not yet available.'
                        : 'Facebook page metrics may require pages_read_engagement.'
                )
            }
        }

        const status: MetricStatus =
            accountMetricsStatus === 'available' && (postMetricsStatus === 'available' || postMetricsStatus === 'unavailable' && platformPublishedRows.length === 0)
                ? 'available'
                : (accountMetricsStatus === 'unavailable' && postMetricsStatus === 'unavailable')
                    ? 'unavailable'
                    : 'partial'

        platformStatuses.push({
            platform,
            connected,
            status,
            accountMetricsStatus,
            postMetricsStatus,
            exactScopesKnown,
            missingPermissions: Array.from(new Set(missingPermissions)),
            warnings: Array.from(new Set(platformWarnings)),
        })
    })

    return {
        hasAnalytics,
        needsSync,
        hasPublishedPosts,
        reason,
        selectedPlatform,
        isCombinedView: selectedPlatform === 'all',
        warnings: Array.from(new Set(warnings)),
        suspectedMissingPermissions: Array.from(suspectedMissingPermissions),
        platformStatuses,
        capabilities: {
            accountMetrics: {
                status: accountStatus,
                availablePlatforms: Array.from(accountMetricPlatforms),
                unavailablePlatforms: accountUnavailablePlatforms,
            },
            postMetrics: {
                status: postStatus,
                totalPublishedPosts,
                postsWithAnalyticsRows,
                platformsWithPublishedPosts: Array.from(platformsWithPublishedPosts),
                platformsWithAnalyticsRows: Array.from(platformsWithAnalyticsRows),
            }
        }
    }
}

function roundPct(value: number): number {
    const rounded = Number((Number.isFinite(value) ? value : 0).toFixed(1))
    return Object.is(rounded, -0) ? 0 : rounded
}

function calculatePeriodChangePct(current: number, previous: number): number {
    const curr = Number.isFinite(current) ? current : 0
    const prev = Number.isFinite(previous) ? previous : 0
    if (prev === 0) {
        // No reliable prior baseline -> avoid fake percentages.
        return 0
    }
    return roundPct(((curr - prev) / Math.abs(prev)) * 100)
}

// Transform database data into analytics response format
function transformRealDataToAnalytics(
    publishedPosts: any[],
    accountAnalytics: any[],
    socialAccounts: any[],
    range: DateRange,
    granularity: Granularity
): AnalyticsResponse {
    const daysCount = range === 'last_7_days' ? 7 : range === 'last_30_days' ? 30 : 90
    const now = new Date()
    const startDate = subDays(now, daysCount)

    // Transform posts with analytics into PostData format (all available posts)
    const allPosts: PostData[] = publishedPosts
        .filter(post => post.published_posts?.length > 0)
        .flatMap(post => {
            // Each post can have multiple published_posts (one per platform)
            return post.published_posts.map((publishedPost: any) => {
                const analytics = publishedPost.post_analytics?.[0] || {}
                const platform = (publishedPost.platform?.toLowerCase() || 'instagram') as Platform
                const timestamp = publishedPost.published_at || post.published_at || post.created_at
                const postCaption = typeof post.content === 'string' && post.content.trim().length > 0
                    ? post.content
                    : (publishedPost.platform_caption || `Direct ${platform.toUpperCase()} post`)

                return {
                    id: publishedPost.id,
                    platform: platform,
                    timeAgo: timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 'just now',
                    caption: postCaption,
                    likes: analytics.likes || 0,
                    comments: analytics.comments || 0,
                    shares: analytics.shares || 0,
                    views: analytics.views || 0,
                    timestamp,
                }
            })
        })
        .filter(post => !!post.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // KPIs are range-based
    const postsInRange = allPosts.filter((post) => new Date(post.timestamp).getTime() >= startDate.getTime())
    const previousPeriodStart = subDays(startDate, daysCount)
    const postsInPreviousRange = allPosts.filter((post) => {
        const ts = new Date(post.timestamp).getTime()
        return ts >= previousPeriodStart.getTime() && ts < startDate.getTime()
    })

    // Cards show latest available posts regardless of selected range
    const latestPost = allPosts.length > 0 ? allPosts[0] : null
    const otherPosts = allPosts.slice(1, 5) // Get up to 4 other posts

    // Calculate KPIs from posts
    const totalLikes = postsInRange.reduce((sum, post) => sum + post.likes, 0)
    const totalComments = postsInRange.reduce((sum, post) => sum + post.comments, 0)
    const totalShares = postsInRange.reduce((sum, post) => sum + post.shares, 0)
    const totalEngagement = totalLikes + totalComments + totalShares
    const totalViews = postsInRange.reduce((sum, post) => sum + post.views, 0)
    const previousEngagement = postsInPreviousRange.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0)
    const previousViews = postsInPreviousRange.reduce((sum, post) => sum + post.views, 0)
    const engagementChangePct = calculatePeriodChangePct(totalEngagement, previousEngagement)
    const viewsChangePct = calculatePeriodChangePct(totalViews, previousViews)

    // Get follower data from account analytics
    const sortedAccountAnalytics = accountAnalytics
        .filter(a => {
            const date = new Date(a.date)
            return date >= startDate
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Generate follower growth data
    const followerGrowthData = generateFollowerGrowthData(
        sortedAccountAnalytics,
        socialAccounts,
        daysCount,
        granularity
    )

    // Build a map of social_account_id -> platform for per-platform breakdown
    const accountPlatformMap = new Map<string, string>()
    socialAccounts.forEach(acc => {
        accountPlatformMap.set(acc.id, acc.platform)
    })

    // Calculate current followers — sum the most recent entry per social account
    const latestByAccount = new Map<string, number>()
    accountAnalytics
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(a => {
            if (!latestByAccount.has(a.social_account_id)) {
                latestByAccount.set(a.social_account_id, a.followers || 0)
            }
        })
    const currentFollowers = Array.from(latestByAccount.values()).reduce((sum, f) => sum + f, 0)

    // Per-platform follower counts
    let facebookFollowers = 0
    let instagramFollowers = 0
    latestByAccount.forEach((followers, accountId) => {
        const platform = accountPlatformMap.get(accountId)
        if (platform === 'facebook') facebookFollowers += followers
        else if (platform === 'instagram') instagramFollowers += followers
    })

    // Calculate previous period followers — sum the most recent entry per account within previous period
    const previousByAccount = new Map<string, number>()
    accountAnalytics
        .filter(a => {
            const date = new Date(a.date)
            return date >= previousPeriodStart && date < startDate
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(a => {
            if (!previousByAccount.has(a.social_account_id)) {
                previousByAccount.set(a.social_account_id, a.followers || 0)
            }
        })
    const previousFollowers = previousByAccount.size > 0
        ? Array.from(previousByAccount.values()).reduce((sum, f) => sum + f, 0)
        : currentFollowers
    const followersChange = previousFollowers > 0
        ? ((currentFollowers - previousFollowers) / previousFollowers) * 100
        : 0
    const followersChangeRounded = roundPct(followersChange)

    // Compare growth rate (current period growth %) vs previous period growth %
    const prePreviousPeriodStart = subDays(previousPeriodStart, daysCount)
    const prePreviousByAccount = new Map<string, number>()
    accountAnalytics
        .filter(a => {
            const date = new Date(a.date)
            return date >= prePreviousPeriodStart && date < previousPeriodStart
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .forEach(a => {
            if (!prePreviousByAccount.has(a.social_account_id)) {
                prePreviousByAccount.set(a.social_account_id, a.followers || 0)
            }
        })
    const prePreviousFollowers = prePreviousByAccount.size > 0
        ? Array.from(prePreviousByAccount.values()).reduce((sum, f) => sum + f, 0)
        : previousFollowers
    const previousGrowthRate = prePreviousFollowers > 0
        ? ((previousFollowers - prePreviousFollowers) / prePreviousFollowers) * 100
        : 0
    const growthRateChangePct = calculatePeriodChangePct(followersChangeRounded, roundPct(previousGrowthRate))

    // Calculate total reach (sum of all post views)
    const totalReach = totalViews

    return {
        kpis: {
            engagement: {
                value: totalEngagement,
                changePct: engagementChangePct,
            },
            views: {
                value: totalViews,
                display: totalViews > 1000 ? `${(totalViews / 1000).toFixed(1)}K` : String(totalViews),
                changePct: viewsChangePct,
            },
            followers: {
                value: currentFollowers,
                changePct: followersChangeRounded,
                facebook: facebookFollowers,
                instagram: instagramFollowers,
            },
            growthRate: {
                value: followersChangeRounded,
                changePct: growthRateChangePct,
            },
        },
        followerGrowth: followerGrowthData,
        latestPost,
        accountAnalytics: {
            totalReach,
            totalEngagement,
            followers: currentFollowers,
            facebookFollowers,
            instagramFollowers,
        },
        otherPosts,
    }
}

function buildEmptyAnalyticsResponse(range: DateRange, granularity: Granularity, socialAccounts: any[] = []): AnalyticsResponse {
    const daysCount = range === 'last_7_days' ? 7 : range === 'last_30_days' ? 30 : 90

    return {
        kpis: {
            engagement: { value: 0, changePct: 0 },
            views: { value: 0, display: '0', changePct: 0 },
            followers: { value: 0, changePct: 0, facebook: 0, instagram: 0 },
            growthRate: { value: 0, changePct: 0 },
        },
        followerGrowth: generateFollowerGrowthData([], socialAccounts, daysCount, granularity),
        latestPost: null,
        accountAnalytics: {
            totalReach: 0,
            totalEngagement: 0,
            followers: 0,
            facebookFollowers: 0,
            instagramFollowers: 0,
        },
        otherPosts: [],
    }
}

// Generate follower growth chart data with per-platform breakdown
function generateFollowerGrowthData(
    accountAnalytics: any[],
    socialAccounts: any[],
    daysCount: number,
    granularity: Granularity
) {
    const labels: string[] = []
    const values: number[] = []
    const facebookValues: number[] = []
    const instagramValues: number[] = []

    // Build account ID -> platform map
    const accountPlatformMap = new Map<string, string>()
    socialAccounts.forEach(acc => {
        accountPlatformMap.set(acc.id, acc.platform)
    })

    // If we have account analytics data, use it
    if (accountAnalytics.length > 0) {
        // Group by date, per platform and total
        const totalByDate = new Map<string, number>()
        const fbByDate = new Map<string, number>()
        const igByDate = new Map<string, number>()

        accountAnalytics.forEach(analytics => {
            const date = format(new Date(analytics.date), 'yyyy-MM-dd')
            const followers = analytics.followers || 0
            const platform = accountPlatformMap.get(analytics.social_account_id)

            totalByDate.set(date, (totalByDate.get(date) || 0) + followers)
            if (platform === 'facebook') {
                fbByDate.set(date, (fbByDate.get(date) || 0) + followers)
            } else if (platform === 'instagram') {
                igByDate.set(date, (igByDate.get(date) || 0) + followers)
            }
        })

        // Sort dates and create labels/values
        const sortedDates = Array.from(totalByDate.keys()).sort()
        sortedDates.forEach(date => {
            const dateObj = new Date(date)
            let include = false
            let label = ''

            if (granularity === 'daily') {
                include = true
                label = format(dateObj, 'MMM d')
            } else if (granularity === 'weekly' && dateObj.getDay() === 0) {
                include = true
                label = format(dateObj, 'MMM d')
            } else if (granularity === 'monthly' && dateObj.getDate() === 1) {
                include = true
                label = format(dateObj, 'MMM yyyy')
            }

            if (include) {
                labels.push(label)
                values.push(totalByDate.get(date) || 0)
                facebookValues.push(fbByDate.get(date) || 0)
                instagramValues.push(igByDate.get(date) || 0)
            }
        })
    }

    // If we don't have enough data points, fill with zeros
    if (labels.length === 0) {
        for (let i = daysCount - 1; i >= 0; i--) {
            const date = subDays(new Date(), i)
            if (granularity === 'daily') {
                labels.push(format(date, 'MMM d'))
                values.push(0)
                facebookValues.push(0)
                instagramValues.push(0)
            }
        }
    }

    // Calculate stats
    const totalGain = values.length >= 2 ? values[values.length - 1] - values[0] : 0
    const avgDaily = values.length > 0 ? Math.floor(totalGain / daysCount) : 0

    // Find best day
    let maxGain = 0
    let bestDayLabel = labels[0] || ''
    for (let i = 1; i < values.length; i++) {
        const gain = values[i] - values[i - 1]
        if (gain > maxGain) {
            maxGain = gain
            bestDayLabel = labels[i]
        }
    }

    return {
        labels,
        values,
        facebookValues,
        instagramValues,
        bestDay: bestDayLabel,
        avgDaily: avgDaily >= 0 ? `+${avgDaily}` : `${avgDaily}`,
        totalGain: totalGain >= 0 ? `+${totalGain}` : `${totalGain}`,
    }
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const supabaseAdmin = createAdminClient()

        // 1. Auth Check
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Workspace Check
        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }

        const searchParams = request.nextUrl.searchParams
        const range = (searchParams.get('range') as DateRange) || 'last_7_days'
        const granularity = (searchParams.get('granularity') as Granularity) || 'daily'
        const platformFilter = (searchParams.get('platform') as AnalyticsPlatformView) || 'all'

        // Validate parameters
        const validRanges: DateRange[] = ['last_7_days', 'last_30_days', 'last_90_days']
        const validGranularities: Granularity[] = ['daily', 'weekly', 'monthly']
        const validPlatformFilters: AnalyticsPlatformView[] = ['all', 'instagram', 'facebook']

        if (!validRanges.includes(range)) {
            return NextResponse.json(
                { error: 'Invalid range parameter' },
                { status: 400 }
            )
        }

        if (!validGranularities.includes(granularity)) {
            return NextResponse.json(
                { error: 'Invalid granularity parameter' },
                { status: 400 }
            )
        }

        if (!validPlatformFilters.includes(platformFilter)) {
            return NextResponse.json(
                { error: 'Invalid platform parameter' },
                { status: 400 }
            )
        }

        // Fetch social accounts for this workspace
        const { data: socialAccounts } = await supabaseAdmin
            .from('social_accounts')
            .select('id, platform, metadata')
            .eq('workspace_id', activeWorkspace.id)
        const socialAccountsList = socialAccounts || []
        const selectedSocialAccounts = platformFilter === 'all'
            ? socialAccountsList
            : socialAccountsList.filter((a) => a.platform === platformFilter)

        // For read API, we only need connected accounts.
        // Token validity affects sync, not displaying already-synced analytics rows.
        const hasConnectedAccounts = selectedSocialAccounts.length > 0

        if (!hasConnectedAccounts) {
            // No connected accounts: return real empty response (not demo data).
            console.log('[Analytics] No connected accounts found, returning empty analytics')
            return NextResponse.json({
                ...buildEmptyAnalyticsResponse(range, granularity, selectedSocialAccounts),
                _meta: {
                    hasAnalytics: false,
                    needsSync: false,
                    reason: platformFilter === 'all' ? 'no_connected_accounts' : 'no_connected_accounts_for_platform',
                    selectedPlatform: platformFilter,
                    isCombinedView: platformFilter === 'all',
                    warnings: [
                        platformFilter === 'all'
                            ? 'No connected social accounts found. Connect Facebook/Instagram accounts in Settings to sync analytics.'
                            : `No connected ${platformFilter === 'instagram' ? 'Instagram' : 'Facebook'} account found for this workspace.`
                    ],
                    suspectedMissingPermissions: [],
                    platformStatuses: [],
                    capabilities: {
                        accountMetrics: {
                            status: 'unavailable',
                            availablePlatforms: [],
                            unavailablePlatforms: [],
                        },
                        postMetrics: {
                            status: 'unavailable',
                            totalPublishedPosts: 0,
                            postsWithAnalyticsRows: 0,
                            platformsWithPublishedPosts: [],
                            platformsWithAnalyticsRows: [],
                        }
                    }
                }
            })
        }

        // Fetch real analytics from database
        console.log('[Analytics] Fetching real analytics data...')
        console.log('[Analytics] Workspace ID:', activeWorkspace.id)

        // Fetch posts separately (avoiding nested query issues with PostgREST)
        const { data: posts, error: postsError } = await supabaseAdmin
            .from('posts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .order('created_at', { ascending: false })
            .limit(50)

        if (postsError) {
            console.error('[Analytics] Error fetching posts:', postsError)
        }

        console.log('[Analytics] Posts found:', posts?.length || 0)

        const accountIds = selectedSocialAccounts.map(a => a.id)

        // Fetch published_posts linked to app posts
        const postIds = posts?.map(p => p.id) || []
        let appLinkedPublishedPosts: any[] = []
        let directPublishedPosts: any[] = []

        if (postIds.length > 0) {
            const { data: pubPosts, error: pubError } = await supabaseAdmin
                .from('published_posts')
                .select('*')
                .in('post_id', postIds)

            if (pubError) {
                console.error('[Analytics] Error fetching published_posts:', pubError)
            }
            appLinkedPublishedPosts = pubPosts || []
        }

        // Fetch direct/native platform posts discovered by sync-analytics.
        // These rows may have post_id = null but social_account_id set.
        if (accountIds.length > 0) {
            try {
                const { data: externalPosts, error: externalError } = await supabaseAdmin
                    .from('published_posts')
                    .select('*')
                    .in('social_account_id', accountIds)

                if (externalError) {
                    console.error('[Analytics] Error fetching direct published_posts:', externalError)
                } else {
                    directPublishedPosts = externalPosts || []
                }
            } catch (externalFetchError) {
                console.error('[Analytics] Direct published_posts query failed:', externalFetchError)
            }
        }

        // Merge and dedupe by published_posts.id
        const publishedPostsMap = new Map<string, any>()
        ;[...appLinkedPublishedPosts, ...directPublishedPosts].forEach((pp) => {
            publishedPostsMap.set(pp.id, pp)
        })
        let publishedPostsData = Array.from(publishedPostsMap.values())
        if (platformFilter !== 'all') {
            publishedPostsData = publishedPostsData.filter((pp) => pp?.platform === platformFilter)
        }

        console.log('[Analytics] Published posts records:', publishedPostsData.length)

        // Fetch post_analytics for these published posts
        const publishedPostIds = publishedPostsData.map(pp => pp.id)
        let postAnalyticsData: any[] = []

        if (publishedPostIds.length > 0) {
            const { data: analytics, error: analyticsError } = await supabaseAdmin
                .from('post_analytics')
                .select('*')
                .in('published_post_id', publishedPostIds)

            if (analyticsError) {
                console.error('[Analytics] Error fetching post_analytics:', analyticsError)
            }
            postAnalyticsData = analytics || []
        }

        console.log('[Analytics] Post analytics records:', postAnalyticsData.length)

        // Get account analytics
        const { data: accountAnalytics } = await supabaseAdmin
            .from('account_analytics')
            .select('*')
            .in('social_account_id', accountIds)
            .order('date', { ascending: false })
            .limit(90)

        console.log('[Analytics] Account analytics:', accountAnalytics?.length || 0)

        const analyticsByPublishedPostId = new Map<string, any[]>()
        postAnalyticsData.forEach((pa) => {
            const key = pa.published_post_id
            const list = analyticsByPublishedPostId.get(key) || []
            list.push(pa)
            analyticsByPublishedPostId.set(key, list)
        })

        // Build a unified post collection:
        // - app-managed posts (linked via post_id)
        // - direct/native posts (no post_id, linked via social_account_id)
        const postsById = new Map<string, any>()
        ;(posts || []).forEach((post) => {
            postsById.set(post.id, { ...post, published_posts: [] as any[] })
        })

        publishedPostsData.forEach((pp) => {
            const analyticsForPost = analyticsByPublishedPostId.get(pp.id) || []

            if (pp.post_id && postsById.has(pp.post_id)) {
                const existing = postsById.get(pp.post_id)
                existing.published_posts.push({ ...pp, post_analytics: analyticsForPost })
                postsById.set(pp.post_id, existing)
                return
            }

            const syntheticId = `external:${pp.id}`
            const existingExternal = postsById.get(syntheticId) || {
                id: syntheticId,
                workspace_id: activeWorkspace.id,
                content: pp.platform_caption || `Direct ${(pp.platform || 'social').toUpperCase()} post`,
                published_at: pp.published_at,
                created_at: pp.published_at,
                published_posts: [] as any[],
            }
            existingExternal.published_posts.push({ ...pp, post_analytics: analyticsForPost })
            postsById.set(syntheticId, existingExternal)
        })

        const publishedPosts = Array.from(postsById.values())

        // Track post presence for metadata only.
        const hasPublishedPosts = publishedPosts.some(p => p.published_posts?.length > 0)

        // Transform real data into analytics format
        // Note: This keeps follower/account metrics from account_analytics even when posts are absent.
        const analyticsData = transformRealDataToAnalytics(
            publishedPosts,
            accountAnalytics || [],
            selectedSocialAccounts,
            range,
            granularity
        )

        // Add metadata to indicate if analytics need syncing
        const hasAnalytics = publishedPosts.some(p =>
            p.published_posts?.some((pp: any) => pp.post_analytics?.length > 0)
        )

        const analyticsMeta = buildAnalyticsMeta({
            socialAccounts: selectedSocialAccounts,
            accountAnalytics: accountAnalytics || [],
            publishedPosts: publishedPostsData,
            postAnalytics: postAnalyticsData,
            hasAnalytics,
            hasPublishedPosts,
            needsSync: !hasAnalytics,
            reason: hasPublishedPosts ? null : 'no_published_posts',
            selectedPlatform: platformFilter,
        })

        return NextResponse.json({
            ...analyticsData,
            _meta: analyticsMeta
        })

    } catch (error) {
        console.error('Analytics API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch analytics data' },
            { status: 500 }
        )
    }
}
