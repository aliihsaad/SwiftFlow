import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PostsChart } from "@/components/dashboard/posts-chart"
import { CalendarView } from "@/components/dashboard/calendar-view"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/utils/supabase/server"

export default async function DashboardPage() {
    const supabase = await createClient()

    // 1. Fetch Counts
    const { count: scheduledCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')

    const { count: postedCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'posted')

    // 2. Fetch Recent Posts for Chart
    const { data: posts } = await supabase
        .from('posts')
        .select('created_at, status, scheduled_for')
        .order('created_at', { ascending: false })
        .limit(50)

    // Aggregate data for chart (mocking simple aggregation)
    const chartData = posts ? posts.reduce((acc: any[], post) => {
        // Simple logic: group by day (would use date-fns in real app)
        const day = new Date(post.created_at).toLocaleDateString('en-US', { weekday: 'short' })
        const existing = acc.find((item: any) => item.day === day)
        if (existing) {
            if (post.status === 'scheduled') existing.scheduled++
            if (post.status === 'posted') existing.posted++
        } else {
            acc.push({
                day,
                scheduled: post.status === 'scheduled' ? 1 : 0,
                posted: post.status === 'posted' ? 1 : 0
            })
        }
        return acc
    }, []).slice(0, 7) : [] // Limit to 7

    // If no data, provide empty state or safe defaults
    const safeChartData = chartData.length > 0 ? chartData : [
        { day: 'Mon', scheduled: 0, posted: 0 },
        { day: 'Tue', scheduled: 0, posted: 0 },
        { day: 'Wed', scheduled: 0, posted: 0 },
        { day: 'Thu', scheduled: 0, posted: 0 },
        { day: 'Fri', scheduled: 0, posted: 0 },
        { day: 'Sat', scheduled: 0, posted: 0 },
        { day: 'Sun', scheduled: 0, posted: 0 },
    ]

    // 3. Calendar posts
    const calendarPosts = posts?.map(p => ({
        date: new Date(p.scheduled_for || p.created_at),
        platform: 'instagram' // simplify for now, real app reads platform field
    })) || []

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
                    Overview
                </h2>
                <Link href="/dashboard/create">
                    <Button className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white shadow-lg shadow-purple-500/20">
                        <Plus className="mr-2 h-4 w-4" /> Create Post
                    </Button>
                </Link>
            </div>

            <MetricsCards
                streak={0} // Logic for streak is complex, keep 0 for now
                scheduledCount={scheduledCount || 0}
                postedCount={postedCount || 0}
            />

            <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
                <PostsChart data={safeChartData} />
                <CalendarView posts={calendarPosts} />
            </div>
        </div>
    )
}
