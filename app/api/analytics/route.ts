import { NextRequest, NextResponse } from 'next/server'
import { DateRange, Granularity } from '@/types/analytics'
import { generateMockAnalyticsData } from '@/lib/analytics-utils'
import { createClient } from '@/utils/supabase/server'
import { getActiveWorkspace } from '@/lib/workspace-utils'

export const runtime = 'edge'

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

        // Fetch Social Connections for this workspace
        const { data: connections } = await supabase
            .from('social_connections')
            .select('*')
            .eq('workspace_id', activeWorkspace.id)

        // If we were using Real API, we'd iterate over connections here.
        // For now, check if we have tokens (or just fallback to mock if env vars missing/mock mode)

        // TODO: Replace with real Meta API integration when credentials are available
        // For now, use mock data for development
        const useMockData = !process.env.FACEBOOK_ACCESS_TOKEN || !process.env.INSTAGRAM_ACCESS_TOKEN

        if (useMockData) {
            // We could customize mock data based on workspace name/id to prove isolation
            const mockData = generateMockAnalyticsData(range, granularity)
            return NextResponse.json(mockData)
        }

        // Real API implementation (commented out for now)
        /*
        const { since, until } = getDateRangeTimestamps(range)
        const metaClient = createMetaAPIClient()
    
        // Parallel fetch from both platforms
        const [igInsights, igMedia, fbInsights, fbPosts, followerCounts] = await Promise.all([
          metaClient.fetchInstagramInsights(['impressions', 'reach', 'profile_views'], since, until),
          metaClient.fetchInstagramMedia(50),
          metaClient.fetchFacebookInsights(['page_impressions', 'page_engaged_users', 'page_fans'], since, until),
          metaClient.fetchFacebookPosts(50),
          metaClient.getFollowerCounts()
        ])
    
        // Transform and aggregate data
        const analyticsData = transformMetaAPIData({
          igInsights,
          igMedia,
          fbInsights,
          fbPosts,
          followerCounts,
          range,
          granularity
        })
    
        return NextResponse.json(analyticsData)
        */

        // Fallback to mock data
        const mockData = generateMockAnalyticsData(range, granularity)
        return NextResponse.json(mockData)

    } catch (error) {
        console.error('Analytics API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch analytics data' },
            { status: 500 }
        )
    }
}
