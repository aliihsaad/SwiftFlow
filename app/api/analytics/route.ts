import { format, formatDistanceToNow, startOfMonth, startOfWeek, subDays } from 'date-fns'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import type {
    AnalyticsMetricStatus,
    AnalyticsResponse,
    DateRange,
    FollowerGrowthData,
    Granularity,
    PostData,
} from '@/types/analytics'

export const runtime = 'edge'

const PLATFORM = 'instagram' as const
const ANALYTICS_SCOPES = [
    'instagram_business_manage_insights',
    'instagram_manage_insights',
] as const

type SocialAccountRow = {
    id: string
    platform: string
    metadata?: Record<string, unknown> | null
}

type PublishedPostRow = {
    id: string
    post_id?: string | null
    platform: string
    platform_caption?: string | null
    permalink?: string | null
    published_at?: string | null
}

type PostAnalyticsRow = {
    published_post_id: string
    likes?: number | null
    comments?: number | null
    shares?: number | null
    views?: number | null
    synced_at?: string | null
}

type AccountAnalyticsRow = {
    social_account_id: string
    followers?: number | null
    date: string
}

function daysForRange(range: DateRange): number {
    return range === 'last_7_days' ? 7 : range === 'last_30_days' ? 30 : 90
}

function roundPercent(value: number): number {
    const rounded = Number((Number.isFinite(value) ? value : 0).toFixed(1))
    return Object.is(rounded, -0) ? 0 : rounded
}

function periodChange(current: number, previous: number): number {
    return previous === 0 ? 0 : roundPercent(((current - previous) / Math.abs(previous)) * 100)
}

function numberValue(value: unknown): number {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function statusForCoverage(total: number, covered: number): AnalyticsMetricStatus {
    if (total === 0 || covered === 0) return 'unavailable'
    return covered < total ? 'partial' : 'available'
}

function grantedScopes(metadata: Record<string, unknown> | null | undefined): {
    exactKnown: boolean
    scopes: Set<string>
} {
    const direct = Array.isArray(metadata?.granted_scopes)
        ? metadata.granted_scopes.filter((scope): scope is string => typeof scope === 'string')
        : []
    const granular = Array.isArray(metadata?.granted_granular_scopes)
        ? metadata.granted_granular_scopes
            .map((entry) => (
                entry && typeof entry === 'object' && typeof (entry as { scope?: unknown }).scope === 'string'
                    ? (entry as { scope: string }).scope
                    : null
            ))
            .filter((scope): scope is string => Boolean(scope))
        : []

    return {
        exactKnown: Array.isArray(metadata?.granted_scopes)
            || Array.isArray(metadata?.granted_granular_scopes),
        scopes: new Set([...direct, ...granular]),
    }
}

function latestPostAnalytics(rows: PostAnalyticsRow[]): Map<string, PostAnalyticsRow> {
    const sorted = [...rows].sort((a, b) =>
        new Date(b.synced_at || 0).getTime()
        - new Date(a.synced_at || 0).getTime(),
    )
    const byPost = new Map<string, PostAnalyticsRow>()
    for (const row of sorted) {
        if (row.published_post_id && !byPost.has(row.published_post_id)) {
            byPost.set(row.published_post_id, row)
        }
    }
    return byPost
}

function latestFollowersByAccount(
    rows: AccountAnalyticsRow[],
    predicate: (timestamp: number) => boolean,
): Map<string, number> {
    const sorted = [...rows].sort((a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    const latest = new Map<string, number>()
    for (const row of sorted) {
        const timestamp = new Date(row.date).getTime()
        if (!Number.isFinite(timestamp) || !predicate(timestamp) || latest.has(row.social_account_id)) {
            continue
        }
        latest.set(row.social_account_id, numberValue(row.followers))
    }
    return latest
}

function sumMap(values: Map<string, number>): number {
    return Array.from(values.values()).reduce((sum, value) => sum + value, 0)
}

function generateFollowerGrowth(
    rows: AccountAnalyticsRow[],
    daysCount: number,
    granularity: Granularity,
): FollowerGrowthData {
    const totalsByDate = new Map<string, number>()
    for (const row of rows) {
        const date = new Date(row.date)
        if (!Number.isFinite(date.getTime())) continue
        const key = format(date, 'yyyy-MM-dd')
        totalsByDate.set(key, (totalsByDate.get(key) || 0) + numberValue(row.followers))
    }

    const bucketLatest = new Map<string, { timestamp: number; label: string; value: number }>()
    for (const [dateKey, value] of totalsByDate) {
        const date = new Date(dateKey + 'T00:00:00Z')
        const bucketDate = granularity === 'weekly'
            ? startOfWeek(date, { weekStartsOn: 1 })
            : granularity === 'monthly'
                ? startOfMonth(date)
                : date
        const bucketKey = format(bucketDate, 'yyyy-MM-dd')
        const label = granularity === 'monthly'
            ? format(bucketDate, 'MMM yyyy')
            : format(bucketDate, 'MMM d')
        const current = bucketLatest.get(bucketKey)
        if (!current || date.getTime() > current.timestamp) {
            bucketLatest.set(bucketKey, { timestamp: date.getTime(), label, value })
        }
    }

    if (bucketLatest.size === 0) {
        for (let offset = daysCount - 1; offset >= 0; offset -= 1) {
            const date = subDays(new Date(), offset)
            const bucketDate = granularity === 'weekly'
                ? startOfWeek(date, { weekStartsOn: 1 })
                : granularity === 'monthly'
                    ? startOfMonth(date)
                    : date
            const bucketKey = format(bucketDate, 'yyyy-MM-dd')
            if (!bucketLatest.has(bucketKey)) {
                bucketLatest.set(bucketKey, {
                    timestamp: bucketDate.getTime(),
                    label: granularity === 'monthly'
                        ? format(bucketDate, 'MMM yyyy')
                        : format(bucketDate, 'MMM d'),
                    value: 0,
                })
            }
        }
    }

    const points = Array.from(bucketLatest.values()).sort((a, b) => a.timestamp - b.timestamp)
    const labels = points.map((point) => point.label)
    const values = points.map((point) => point.value)
    const totalGain = values.length > 1 ? values[values.length - 1] - values[0] : 0
    const avgDaily = Math.trunc(totalGain / Math.max(daysCount, 1))
    let bestDay = labels[0] || ''

    for (let index = 1; index < values.length; index += 1) {
        const currentGain = values[index] - values[index - 1]
        const bestIndex = Math.max(labels.indexOf(bestDay), 1)
        const bestGain = values[bestIndex] - values[bestIndex - 1]
        if (currentGain > bestGain) bestDay = labels[index]
    }

    return {
        labels,
        values,
        instagramValues: [...values],
        bestDay,
        avgDaily: avgDaily >= 0 ? '+' + avgDaily : String(avgDaily),
        totalGain: totalGain >= 0 ? '+' + totalGain : String(totalGain),
    }
}

function emptyAnalytics(
    range: DateRange,
    granularity: Granularity,
    reason: string,
    connected: boolean,
): AnalyticsResponse {
    return {
        kpis: {
            engagement: { value: 0, changePct: 0 },
            views: { value: 0, display: '0', changePct: 0 },
            followers: { value: 0, changePct: 0, instagram: 0 },
            growthRate: { value: 0, changePct: 0 },
        },
        followerGrowth: generateFollowerGrowth([], daysForRange(range), granularity),
        latestPost: null,
        topPosts: [],
        accountAnalytics: {
            totalReach: 0,
            totalEngagement: 0,
            followers: 0,
            instagramFollowers: 0,
        },
        otherPosts: [],
        _meta: {
            hasAnalytics: false,
            needsSync: false,
            hasPublishedPosts: false,
            postsInRange: 0,
            lastSyncedAt: null,
            metricsCoveragePct: 0,
            reason,
            selectedPlatform: PLATFORM,
            isCombinedView: false,
            warnings: connected
                ? ['No Instagram analytics have been synced yet.']
                : ['No Instagram professional account is connected to this workspace.'],
            suspectedMissingPermissions: connected ? [ANALYTICS_SCOPES[0]] : [],
            platformStatuses: connected ? [{
                platform: PLATFORM,
                connected: true,
                status: 'unavailable',
                accountMetricsStatus: 'unavailable',
                postMetricsStatus: 'unavailable',
                exactScopesKnown: false,
                missingPermissions: [],
                warnings: ['Instagram analytics are waiting for the first successful sync.'],
            }] : [],
            capabilities: {
                accountMetrics: {
                    status: 'unavailable',
                    availablePlatforms: [],
                    unavailablePlatforms: connected ? [PLATFORM] : [],
                },
                postMetrics: {
                    status: 'unavailable',
                    totalPublishedPosts: 0,
                    postsWithAnalyticsRows: 0,
                    platformsWithPublishedPosts: [],
                    platformsWithAnalyticsRows: [],
                },
            },
            contentDiscovery: {
                byPlatform: [{
                    platform: PLATFORM,
                    totalSyncedPosts: 0,
                    appManagedPosts: 0,
                    discoveredNativePosts: 0,
                    latestPublishedAt: null,
                    topPost: null,
                }],
            },
        },
    }
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()
        const admin = createAdminClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const activeWorkspace = await getActiveWorkspace()
        if (!activeWorkspace) {
            return NextResponse.json({ error: 'No active workspace found' }, { status: 404 })
        }

        const range = (request.nextUrl.searchParams.get('range') || 'last_7_days') as DateRange
        const granularity = (request.nextUrl.searchParams.get('granularity') || 'daily') as Granularity
        const validRanges: DateRange[] = ['last_7_days', 'last_30_days', 'last_90_days']
        const validGranularities: Granularity[] = ['daily', 'weekly', 'monthly']

        if (!validRanges.includes(range)) {
            return NextResponse.json({ error: 'Invalid range parameter' }, { status: 400 })
        }
        if (!validGranularities.includes(granularity)) {
            return NextResponse.json({ error: 'Invalid granularity parameter' }, { status: 400 })
        }

        const { data: accountData, error: accountError } = await admin
            .from('social_accounts')
            .select('id, platform, metadata')
            .eq('workspace_id', activeWorkspace.id)
            .eq('platform', PLATFORM)

        if (accountError) throw accountError

        const accounts = (accountData || []) as SocialAccountRow[]
        if (accounts.length === 0) {
            return NextResponse.json(emptyAnalytics(range, granularity, 'no_instagram_account', false))
        }

        const accountIds = accounts.map((account) => account.id)
        const { data: publishedData, error: publishedError } = await admin
            .from('published_posts')
            .select('id, post_id, platform, platform_caption, permalink, published_at')
            .in('social_account_id', accountIds)
            .eq('platform', PLATFORM)
            .order('published_at', { ascending: false })
            .limit(500)

        if (publishedError) throw publishedError

        const publishedPosts = (publishedData || []) as PublishedPostRow[]
        const publishedPostIds = publishedPosts.map((post) => post.id)
        let postAnalytics: PostAnalyticsRow[] = []

        if (publishedPostIds.length > 0) {
            const { data, error } = await admin
                .from('post_analytics')
                .select('published_post_id, likes, comments, shares, views, synced_at')
                .in('published_post_id', publishedPostIds)

            if (error) throw error
            postAnalytics = (data || []) as PostAnalyticsRow[]
        }

        const { data: accountAnalyticsData, error: accountAnalyticsError } = await admin
            .from('account_analytics')
            .select('social_account_id, followers, date')
            .in('social_account_id', accountIds)
            .order('date', { ascending: true })
            .limit(1000)

        if (accountAnalyticsError) throw accountAnalyticsError

        const accountAnalytics = (accountAnalyticsData || []) as AccountAnalyticsRow[]
        const analyticsByPost = latestPostAnalytics(postAnalytics)
        const allPosts: PostData[] = publishedPosts
            .map((post) => {
                const analytics = analyticsByPost.get(post.id)
                const timestamp = post.published_at
                if (!timestamp) return null
                return {
                    id: post.id,
                    platform: PLATFORM,
                    timeAgo: formatDistanceToNow(new Date(timestamp), { addSuffix: true }),
                    caption: post.platform_caption || 'Instagram post',
                    likes: numberValue(analytics?.likes),
                    comments: numberValue(analytics?.comments),
                    shares: numberValue(analytics?.shares),
                    views: numberValue(analytics?.views),
                    timestamp,
                } satisfies PostData
            })
            .filter((post): post is PostData => post !== null)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        const now = Date.now()
        const daysCount = daysForRange(range)
        const currentStart = subDays(new Date(now), daysCount).getTime()
        const previousStart = subDays(new Date(currentStart), daysCount).getTime()
        const prePreviousStart = subDays(new Date(previousStart), daysCount).getTime()
        const currentPosts = allPosts.filter((post) => new Date(post.timestamp).getTime() >= currentStart)
        const previousPosts = allPosts.filter((post) => {
            const timestamp = new Date(post.timestamp).getTime()
            return timestamp >= previousStart && timestamp < currentStart
        })
        const sumPostMetric = (posts: PostData[], metric: 'likes' | 'comments' | 'shares' | 'views') =>
            posts.reduce((sum, post) => sum + post[metric], 0)
        const currentEngagement =
            sumPostMetric(currentPosts, 'likes')
            + sumPostMetric(currentPosts, 'comments')
            + sumPostMetric(currentPosts, 'shares')
        const previousEngagement =
            sumPostMetric(previousPosts, 'likes')
            + sumPostMetric(previousPosts, 'comments')
            + sumPostMetric(previousPosts, 'shares')
        const currentViews = sumPostMetric(currentPosts, 'views')
        const previousViews = sumPostMetric(previousPosts, 'views')

        const currentFollowers = sumMap(latestFollowersByAccount(accountAnalytics, () => true))
        const previousFollowersMap = latestFollowersByAccount(
            accountAnalytics,
            (timestamp) => timestamp < currentStart,
        )
        const previousFollowers = previousFollowersMap.size > 0
            ? sumMap(previousFollowersMap)
            : currentFollowers
        const prePreviousFollowersMap = latestFollowersByAccount(
            accountAnalytics,
            (timestamp) => timestamp < previousStart && timestamp >= prePreviousStart,
        )
        const prePreviousFollowers = prePreviousFollowersMap.size > 0
            ? sumMap(prePreviousFollowersMap)
            : previousFollowers
        const followerGrowth = previousFollowers > 0
            ? roundPercent(((currentFollowers - previousFollowers) / previousFollowers) * 100)
            : 0
        const previousGrowth = prePreviousFollowers > 0
            ? roundPercent(((previousFollowers - prePreviousFollowers) / prePreviousFollowers) * 100)
            : 0

        const currentAccountRows = accountAnalytics.filter(
            (row) => new Date(row.date).getTime() >= currentStart,
        )
        const chart = generateFollowerGrowth(currentAccountRows, daysCount, granularity)
        const postsWithAnalyticsRows = new Set(postAnalytics.map((row) => row.published_post_id)).size
        const metricsCoveragePct = publishedPosts.length > 0
            ? Math.round((postsWithAnalyticsRows / publishedPosts.length) * 100)
            : 0
        const lastPostSync = postAnalytics.reduce<string | null>((latest, row) => {
            if (!row.synced_at) return latest
            return !latest || new Date(row.synced_at).getTime() > new Date(latest).getTime()
                ? row.synced_at
                : latest
        }, null)
        const lastAccountSync = accountAnalytics.at(-1)?.date || null
        const lastSyncedAt = [lastPostSync, lastAccountSync]
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] || null
        const accountMetricsStatus: AnalyticsMetricStatus =
            accountAnalytics.length > 0 ? 'available' : 'unavailable'
        const postMetricsStatus = statusForCoverage(publishedPosts.length, postsWithAnalyticsRows)
        const combinedStatus: AnalyticsMetricStatus =
            accountMetricsStatus === 'available'
                && (postMetricsStatus === 'available' || publishedPosts.length === 0)
                ? 'available'
                : accountMetricsStatus === 'unavailable' && postMetricsStatus === 'unavailable'
                    ? 'unavailable'
                    : 'partial'

        const scopeState = grantedScopes(accounts[0]?.metadata)
        const hasInsightsScope = ANALYTICS_SCOPES.some((scope) => scopeState.scopes.has(scope))
        const warnings: string[] = []
        if (accountMetricsStatus === 'unavailable') {
            warnings.push('Instagram follower analytics have not synced yet.')
        }
        if (publishedPosts.length === 0) {
            warnings.push('No Instagram posts are available for the selected workspace.')
        } else if (postMetricsStatus !== 'available') {
            warnings.push('Some Instagram posts do not have synced metrics yet.')
        }
        if (scopeState.exactKnown && !hasInsightsScope) {
            warnings.push('Reconnect Instagram to approve insights access.')
        }

        const topPost = [...publishedPosts]
            .map((post) => {
                const analytics = analyticsByPost.get(post.id)
                return {
                    post,
                    analytics,
                    score: numberValue(analytics?.likes)
                        + numberValue(analytics?.comments)
                        + numberValue(analytics?.shares),
                }
            })
            .sort((a, b) => b.score - a.score)[0]

        const topPosts = [...currentPosts]
            .sort((a, b) => {
                const scoreA = a.likes + a.comments + a.shares
                const scoreB = b.likes + b.comments + b.shares
                return scoreB - scoreA || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            })
            .slice(0, 8)

        const response: AnalyticsResponse = {
            kpis: {
                engagement: {
                    value: currentEngagement,
                    changePct: periodChange(currentEngagement, previousEngagement),
                },
                views: {
                    value: currentViews,
                    display: currentViews > 1000 ? (currentViews / 1000).toFixed(1) + 'K' : String(currentViews),
                    changePct: periodChange(currentViews, previousViews),
                },
                followers: {
                    value: currentFollowers,
                    changePct: followerGrowth,
                    instagram: currentFollowers,
                },
                growthRate: {
                    value: followerGrowth,
                    changePct: periodChange(followerGrowth, previousGrowth),
                },
            },
            followerGrowth: chart,
            latestPost: currentPosts[0] || null,
            topPosts,
            accountAnalytics: {
                totalReach: currentViews,
                totalEngagement: currentEngagement,
                followers: currentFollowers,
                instagramFollowers: currentFollowers,
            },
            otherPosts: topPosts.slice(1, 5),
            _meta: {
                hasAnalytics: accountAnalytics.length > 0 || postAnalytics.length > 0,
                needsSync: publishedPosts.length > postsWithAnalyticsRows,
                hasPublishedPosts: publishedPosts.length > 0,
                postsInRange: currentPosts.length,
                lastSyncedAt,
                metricsCoveragePct,
                reason: publishedPosts.length === 0
                    ? 'no_published_posts'
                    : currentPosts.length === 0
                        ? 'no_published_posts_in_range'
                        : null,
                selectedPlatform: PLATFORM,
                isCombinedView: false,
                warnings,
                suspectedMissingPermissions: scopeState.exactKnown && !hasInsightsScope
                    ? [ANALYTICS_SCOPES[0]]
                    : [],
                platformStatuses: [{
                    platform: PLATFORM,
                    connected: true,
                    status: combinedStatus,
                    accountMetricsStatus,
                    postMetricsStatus,
                    exactScopesKnown: scopeState.exactKnown,
                    missingPermissions: scopeState.exactKnown && !hasInsightsScope
                        ? [ANALYTICS_SCOPES[0]]
                        : [],
                    warnings,
                }],
                capabilities: {
                    accountMetrics: {
                        status: accountMetricsStatus,
                        availablePlatforms: accountMetricsStatus === 'available' ? [PLATFORM] : [],
                        unavailablePlatforms: accountMetricsStatus === 'available' ? [] : [PLATFORM],
                    },
                    postMetrics: {
                        status: postMetricsStatus,
                        totalPublishedPosts: publishedPosts.length,
                        postsWithAnalyticsRows,
                        platformsWithPublishedPosts: publishedPosts.length > 0 ? [PLATFORM] : [],
                        platformsWithAnalyticsRows: postsWithAnalyticsRows > 0 ? [PLATFORM] : [],
                    },
                },
                contentDiscovery: {
                    byPlatform: [{
                        platform: PLATFORM,
                        totalSyncedPosts: publishedPosts.length,
                        appManagedPosts: publishedPosts.filter((post) => Boolean(post.post_id)).length,
                        discoveredNativePosts: publishedPosts.filter((post) => !post.post_id).length,
                        latestPublishedAt: publishedPosts[0]?.published_at || null,
                        topPost: topPost ? {
                            id: topPost.post.id,
                            caption: topPost.post.platform_caption || 'Instagram post',
                            permalink: topPost.post.permalink || null,
                            likes: numberValue(topPost.analytics?.likes),
                            comments: numberValue(topPost.analytics?.comments),
                            shares: numberValue(topPost.analytics?.shares),
                            views: numberValue(topPost.analytics?.views),
                            source: topPost.post.post_id ? 'app_managed' : 'native_discovered',
                        } : null,
                    }],
                },
            },
        }

        return NextResponse.json(response)
    } catch (error) {
        console.error('Instagram analytics API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch Instagram analytics data' },
            { status: 500 },
        )
    }
}
