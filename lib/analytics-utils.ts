import { DateRange, Granularity, AnalyticsResponse, PostData } from '@/types/analytics'
import { formatDistanceToNow, format, subDays, startOfDay, endOfDay } from 'date-fns'

/**
 * Calculate Unix timestamps from date range
 */
export function getDateRangeTimestamps(range: DateRange): { since: number; until: number } {
    const now = new Date()
    const until = Math.floor(endOfDay(now).getTime() / 1000)

    let since: number
    switch (range) {
        case 'last_7_days':
            since = Math.floor(startOfDay(subDays(now, 7)).getTime() / 1000)
            break
        case 'last_30_days':
            since = Math.floor(startOfDay(subDays(now, 30)).getTime() / 1000)
            break
        case 'last_90_days':
            since = Math.floor(startOfDay(subDays(now, 90)).getTime() / 1000)
            break
        default:
            since = Math.floor(startOfDay(subDays(now, 7)).getTime() / 1000)
    }

    return { since, until }
}

/**
 * Generate mock analytics data for development/testing
 */
export function generateMockAnalyticsData(range: DateRange, granularity: Granularity): AnalyticsResponse {
    const daysCount = range === 'last_7_days' ? 7 : range === 'last_30_days' ? 30 : 90

    // Generate follower growth data
    const labels: string[] = []
    const values: number[] = []
    let currentFollowers = 1200
    let maxGain = 0
    let bestDayLabel = ''

    for (let i = daysCount - 1; i >= 0; i--) {
        const date = subDays(new Date(), i)
        const dailyGain = Math.floor(Math.random() * 10) + 1
        currentFollowers += dailyGain

        if (dailyGain > maxGain) {
            maxGain = dailyGain
            bestDayLabel = format(date, 'MMM d')
        }

        if (granularity === 'daily') {
            labels.push(format(date, 'MMM d'))
            values.push(currentFollowers)
        } else if (granularity === 'weekly' && i % 7 === 0) {
            labels.push(format(date, 'MMM d'))
            values.push(currentFollowers)
        } else if (granularity === 'monthly' && date.getDate() === 1) {
            labels.push(format(date, 'MMM yyyy'))
            values.push(currentFollowers)
        }
    }

    const totalGain = values[values.length - 1] - values[0]
    const avgDaily = Math.floor(totalGain / daysCount)

    // Generate mock posts
    const mockPosts: PostData[] = [
        {
            id: '1',
            platform: 'instagram',
            timeAgo: formatDistanceToNow(subDays(new Date(), 0), { addSuffix: true }),
            caption: 'Excited to share our latest project! 🚀 We\'ve been working on something amazing that we can\'t wait to reveal. Stay tuned for more updates coming soon! #Innovation #Tech #Development',
            likes: 342,
            comments: 28,
            shares: 15,
            views: 2840,
            timestamp: subDays(new Date(), 0).toISOString()
        },
        {
            id: '2',
            platform: 'facebook',
            timeAgo: formatDistanceToNow(subDays(new Date(), 2), { addSuffix: true }),
            caption: 'Thank you to everyone who attended our webinar! The response was incredible. For those who missed it, we\'ll be sharing a recording soon. 📹',
            likes: 218,
            comments: 34,
            shares: 42,
            views: 3120,
            timestamp: subDays(new Date(), 2).toISOString()
        },
        {
            id: '3',
            platform: 'instagram',
            timeAgo: formatDistanceToNow(subDays(new Date(), 5), { addSuffix: true }),
            caption: 'Behind the scenes look at our creative process! ✨ Our team has been brainstorming incredible ideas for upcoming campaigns.',
            likes: 567,
            comments: 45,
            shares: 23,
            views: 4250,
            timestamp: subDays(new Date(), 5).toISOString()
        },
        {
            id: '4',
            platform: 'facebook',
            timeAgo: formatDistanceToNow(subDays(new Date(), 8), { addSuffix: true }),
            caption: 'Monday motivation! 💪 Remember, every great achievement starts with a single step. What are you working on this week?',
            likes: 189,
            comments: 19,
            shares: 8,
            views: 1980,
            timestamp: subDays(new Date(), 8).toISOString()
        },
        {
            id: '5',
            platform: 'instagram',
            timeAgo: formatDistanceToNow(subDays(new Date(), 12), { addSuffix: true }),
            caption: 'New blog post alert! 📝 Check out our latest article on social media trends for 2026. Link in bio!',
            likes: 423,
            comments: 52,
            shares: 67,
            views: 5340,
            timestamp: subDays(new Date(), 12).toISOString()
        },
    ]

    const latestPost = mockPosts[0]
    const otherPosts = mockPosts.slice(1)

    // Calculate KPIs
    const totalEngagement = mockPosts.reduce((sum, post) => sum + post.likes + post.comments + post.shares, 0)
    const totalViews = mockPosts.reduce((sum, post) => sum + post.views, 0)

    return {
        kpis: {
            engagement: {
                value: totalEngagement,
                changePct: 12.5,
            },
            views: {
                value: totalViews,
                display: totalViews > 1000 ? `${(totalViews / 1000).toFixed(1)}K` : String(totalViews),
                changePct: 8.3,
            },
            followers: {
                value: currentFollowers,
                changePct: 5.7,
                facebook: 0,
                instagram: 0,
            },
            growthRate: {
                value: 4.2,
                changePct: 2.1,
            },
        },
        followerGrowth: {
            labels,
            values,
            facebookValues: values.map(() => 0),
            instagramValues: values.map(() => 0),
            bestDay: bestDayLabel,
            avgDaily: `+${avgDaily}`,
            totalGain: `+${totalGain}`,
        },
        latestPost,
        accountAnalytics: {
            totalReach: 45280,
            totalEngagement: totalEngagement,
            followers: currentFollowers,
            facebookFollowers: 0,
            instagramFollowers: 0,
        },
        otherPosts,
    }
}
