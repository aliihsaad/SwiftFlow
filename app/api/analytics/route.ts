import { NextRequest, NextResponse } from 'next/server'
import { DateRange, Granularity, AnalyticsResponse, PostData, Platform } from '@/types/analytics'
import { generateMockAnalyticsData } from '@/lib/analytics-utils'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'
import { format, subDays, formatDistanceToNow } from 'date-fns'

export const runtime = 'edge'

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

    // Transform posts with analytics into PostData format
    const posts: PostData[] = publishedPosts
        .filter(post => {
            // Filter posts within the date range
            const publishedAt = post.published_at ? new Date(post.published_at) : null
            return publishedAt && publishedAt >= startDate && post.published_posts?.length > 0
        })
        .flatMap(post => {
            // Each post can have multiple published_posts (one per platform)
            return post.published_posts.map((publishedPost: any) => {
                const analytics = publishedPost.post_analytics?.[0] || {}
                const platform = (publishedPost.platform?.toLowerCase() || 'instagram') as Platform

                return {
                    id: publishedPost.id,
                    platform: platform,
                    timeAgo: formatDistanceToNow(new Date(publishedPost.published_at || post.published_at), { addSuffix: true }),
                    caption: post.content || '',
                    likes: analytics.likes || 0,
                    comments: analytics.comments || 0,
                    shares: analytics.shares || 0,
                    views: analytics.views || 0,
                    timestamp: publishedPost.published_at || post.published_at,
                }
            })
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    // Separate latest post from others
    const latestPost = posts.length > 0 ? posts[0] : null
    const otherPosts = posts.slice(1, 5) // Get up to 4 other posts

    // Calculate KPIs from posts
    const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0)
    const totalComments = posts.reduce((sum, post) => sum + post.comments, 0)
    const totalShares = posts.reduce((sum, post) => sum + post.shares, 0)
    const totalEngagement = totalLikes + totalComments + totalShares
    const totalViews = posts.reduce((sum, post) => sum + post.views, 0)

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

    // Calculate current followers (most recent analytics)
    const latestAccountAnalytics = accountAnalytics
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
    const currentFollowers = latestAccountAnalytics?.followers ||
        socialAccounts.reduce((sum, acc) => sum + (acc.followers_count || 0), 0)

    // Calculate previous period followers for change percentage
    const previousPeriodStart = subDays(startDate, daysCount)
    const previousPeriodAnalytics = accountAnalytics
        .filter(a => {
            const date = new Date(a.date)
            return date >= previousPeriodStart && date < startDate
        })
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]

    const previousFollowers = previousPeriodAnalytics?.followers || currentFollowers
    const followersChange = previousFollowers > 0
        ? ((currentFollowers - previousFollowers) / previousFollowers) * 100
        : 0

    // Calculate total reach (sum of all post views)
    const totalReach = totalViews

    return {
        kpis: {
            engagement: {
                value: totalEngagement,
                changePct: 12.5, // TODO: Calculate actual change from previous period
            },
            views: {
                value: totalViews,
                display: totalViews > 1000 ? `${(totalViews / 1000).toFixed(1)}K` : String(totalViews),
                changePct: 8.3, // TODO: Calculate actual change from previous period
            },
            followers: {
                value: currentFollowers,
                changePct: Number(followersChange.toFixed(1)),
            },
            growthRate: {
                value: Number(followersChange.toFixed(1)),
                changePct: 2.1, // TODO: Calculate actual change from previous period
            },
        },
        followerGrowth: followerGrowthData,
        latestPost,
        accountAnalytics: {
            totalReach,
            totalEngagement,
            followers: currentFollowers,
        },
        otherPosts,
    }
}

// Generate follower growth chart data
function generateFollowerGrowthData(
    accountAnalytics: any[],
    socialAccounts: any[],
    daysCount: number,
    granularity: Granularity
) {
    const labels: string[] = []
    const values: number[] = []

    // If we have account analytics data, use it
    if (accountAnalytics.length > 0) {
        // Group by date and sum followers across accounts
        const followersByDate = new Map<string, number>()

        accountAnalytics.forEach(analytics => {
            const date = format(new Date(analytics.date), 'yyyy-MM-dd')
            const current = followersByDate.get(date) || 0
            followersByDate.set(date, current + (analytics.followers || 0))
        })

        // Sort dates and create labels/values
        const sortedDates = Array.from(followersByDate.keys()).sort()
        sortedDates.forEach(date => {
            const dateObj = new Date(date)
            if (granularity === 'daily') {
                labels.push(format(dateObj, 'MMM d'))
                values.push(followersByDate.get(date) || 0)
            } else if (granularity === 'weekly' && dateObj.getDay() === 0) {
                labels.push(format(dateObj, 'MMM d'))
                values.push(followersByDate.get(date) || 0)
            } else if (granularity === 'monthly' && dateObj.getDate() === 1) {
                labels.push(format(dateObj, 'MMM yyyy'))
                values.push(followersByDate.get(date) || 0)
            }
        })
    }

    // If we don't have enough data points, use current follower count
    if (labels.length === 0) {
        const currentFollowers = socialAccounts.reduce((sum, acc) => sum + (acc.followers_count || 0), 0)
        for (let i = daysCount - 1; i >= 0; i--) {
            const date = subDays(new Date(), i)
            if (granularity === 'daily') {
                labels.push(format(date, 'MMM d'))
                values.push(currentFollowers)
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
        bestDay: bestDayLabel,
        avgDaily: avgDaily >= 0 ? `+${avgDaily}` : `${avgDaily}`,
        totalGain: totalGain >= 0 ? `+${totalGain}` : `${totalGain}`,
    }
}

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient()

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

        // Validate parameters
        const validRanges: DateRange[] = ['last_7_days', 'last_30_days', 'last_90_days']
        const validGranularities: Granularity[] = ['daily', 'weekly', 'monthly']

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

        // Fetch social accounts for this workspace
        const { data: socialAccounts } = await supabase
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)

        // Check if we have connected accounts with valid tokens
        const hasValidAccounts = socialAccounts && socialAccounts.length > 0 &&
            socialAccounts.some(acc => acc.access_token)

        if (!hasValidAccounts) {
            // No connected accounts, return mock data
            console.log('[Analytics] No connected accounts found, returning mock data')
            const mockData = generateMockAnalyticsData(range, granularity)
            return NextResponse.json(mockData)
        }

        // Fetch real analytics from database
        console.log('[Analytics] Fetching real analytics data...')
        console.log('[Analytics] Workspace ID:', activeWorkspace.id)

        // Fetch posts separately (avoiding nested query issues with PostgREST)
        const { data: posts, error: postsError } = await supabase
            .from('posts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
            .eq('status', 'published')
            .order('created_at', { ascending: false })
            .limit(50)

        if (postsError) {
            console.error('[Analytics] Error fetching posts:', postsError)
        }

        console.log('[Analytics] Posts found:', posts?.length || 0)

        // Fetch published_posts for these posts
        const postIds = posts?.map(p => p.id) || []
        let publishedPostsData: any[] = []

        if (postIds.length > 0) {
            const { data: pubPosts, error: pubError } = await supabase
                .from('published_posts')
                .select('*')
                .in('post_id', postIds)

            if (pubError) {
                console.error('[Analytics] Error fetching published_posts:', pubError)
            }
            publishedPostsData = pubPosts || []
        }

        console.log('[Analytics] Published posts records:', publishedPostsData.length)

        // Fetch post_analytics for these published posts
        const publishedPostIds = publishedPostsData.map(pp => pp.id)
        let postAnalyticsData: any[] = []

        if (publishedPostIds.length > 0) {
            const { data: analytics, error: analyticsError } = await supabase
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
        const accountIds = socialAccounts.map(a => a.id)
        const { data: accountAnalytics } = await supabase
            .from('account_analytics')
            .select('*')
            .in('social_account_id', accountIds)
            .order('date', { ascending: false })
            .limit(90)

        console.log('[Analytics] Account analytics:', accountAnalytics?.length || 0)

        // Manually join the data
        const publishedPosts = posts?.map(post => {
            const postPublishedPosts = publishedPostsData
                .filter(pp => pp.post_id === post.id)
                .map(pp => ({
                    ...pp,
                    post_analytics: postAnalyticsData.filter(pa => pa.published_post_id === pp.id)
                }))

            return {
                ...post,
                published_posts: postPublishedPosts
            }
        }) || []

        // Check if we have any published posts with published_posts records
        const hasPublishedPosts = publishedPosts.length > 0 &&
            publishedPosts.some(p => p.published_posts?.length > 0)

        if (!hasPublishedPosts) {
            console.log('[Analytics] No published posts with platform records found, returning mock data')
            return NextResponse.json(generateMockAnalyticsData(range, granularity))
        }

        // Transform real data into analytics format
        // Note: This will show posts even if analytics haven't been synced yet (with 0 values)
        const analyticsData = transformRealDataToAnalytics(
            publishedPosts,
            accountAnalytics || [],
            socialAccounts,
            range,
            granularity
        )

        // Add metadata to indicate if analytics need syncing
        const hasAnalytics = publishedPosts.some(p =>
            p.published_posts?.some((pp: any) => pp.post_analytics?.length > 0)
        )

        return NextResponse.json({
            ...analyticsData,
            _meta: {
                hasAnalytics,
                needsSync: !hasAnalytics
            }
        })

    } catch (error) {
        console.error('Analytics API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch analytics data' },
            { status: 500 }
        )
    }
}
