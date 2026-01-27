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

        // Get published posts with analytics
        const { data: publishedPosts } = await supabase
            .from('posts')
            .select(`
                *,
                published_posts(
                    *,
                    post_analytics(*)
                )
            `)
            .eq('workspace_id', activeWorkspace.id)
            .eq('status', 'published')
            .order('published_at', { ascending: false })
            .limit(50)

        // Get account analytics
        const accountIds = socialAccounts.map(a => a.id)
        const { data: accountAnalytics } = await supabase
            .from('account_analytics')
            .select('*')
            .in('social_account_id', accountIds)
            .order('date', { ascending: false })
            .limit(90)

        console.log('[Analytics] Published posts:', publishedPosts?.length || 0)
        console.log('[Analytics] Account analytics:', accountAnalytics?.length || 0)

        // For now, return mock data but log that we have real data available
        // TODO: Transform real data into analytics format
        return NextResponse.json(generateMockAnalyticsData(range, granularity))

    } catch (error) {
        console.error('Analytics API error:', error)
        return NextResponse.json(
            { error: 'Failed to fetch analytics data' },
            { status: 500 }
        )
    }
}
