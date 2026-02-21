import { NextRequest, NextResponse } from 'next/server'
import { DateRange, Granularity, AnalyticsResponse, PostData, Platform } from '@/types/analytics'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
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

    // Cards show latest available posts regardless of selected range
    const latestPost = allPosts.length > 0 ? allPosts[0] : null
    const otherPosts = allPosts.slice(1, 5) // Get up to 4 other posts

    // Calculate KPIs from posts
    const totalLikes = postsInRange.reduce((sum, post) => sum + post.likes, 0)
    const totalComments = postsInRange.reduce((sum, post) => sum + post.comments, 0)
    const totalShares = postsInRange.reduce((sum, post) => sum + post.shares, 0)
    const totalEngagement = totalLikes + totalComments + totalShares
    const totalViews = postsInRange.reduce((sum, post) => sum + post.views, 0)

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
    const previousPeriodStart = subDays(startDate, daysCount)
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
                facebook: facebookFollowers,
                instagram: instagramFollowers,
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
        const { data: socialAccounts } = await supabaseAdmin
            .from('social_accounts')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)
        const socialAccountsList = socialAccounts || []

        // For read API, we only need connected accounts.
        // Token validity affects sync, not displaying already-synced analytics rows.
        const hasConnectedAccounts = socialAccountsList.length > 0

        if (!hasConnectedAccounts) {
            // No connected accounts: return real empty response (not demo data).
            console.log('[Analytics] No connected accounts found, returning empty analytics')
            return NextResponse.json({
                ...buildEmptyAnalyticsResponse(range, granularity, socialAccountsList),
                _meta: {
                    hasAnalytics: false,
                    needsSync: false,
                    reason: 'no_connected_accounts'
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

        const accountIds = socialAccountsList.map(a => a.id)

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
        const publishedPostsData = Array.from(publishedPostsMap.values())

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
            socialAccountsList,
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
                needsSync: !hasAnalytics,
                hasPublishedPosts,
                reason: hasPublishedPosts ? null : 'no_published_posts'
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
