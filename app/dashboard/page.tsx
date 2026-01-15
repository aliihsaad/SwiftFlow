import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PostsChart } from "@/components/dashboard/posts-chart"
import { CalendarView } from "@/components/dashboard/calendar-view"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RecentActivityDropdown, RecentAction } from "@/components/dashboard/recent-activity-dropdown"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import { Button } from "@/components/ui/button"
import { Plus, ArrowRight } from "lucide-react"
import Link from "next/link"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { formatDistanceToNow } from "date-fns"

export default async function DashboardPage() {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        return (
            <div className="flex h-full flex-col items-center justify-center space-y-4">
                <p>No active workspace selected.</p>
            </div>
        )
    }

    // 1. Fetch Counts
    const { count: scheduledCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .eq('workspace_id', activeWorkspace.id)

    const { count: postedCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'posted')
        .eq('workspace_id', activeWorkspace.id)

    // Draft counts
    const { count: draftCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft')
        .eq('workspace_id', activeWorkspace.id)

    // 2. Fetch Recent Posts for Chart & Activity
    const { data: posts } = await supabase
        .from('posts')
        .select('created_at, status, scheduled_for, content, platforms')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(50)

    // Aggregate data for chart
    const chartData = posts ? posts.reduce((acc: any[], post) => {
        const day = new Date(post.created_at).toLocaleDateString('en-US', { weekday: 'short' })
        const existing = acc.find((item: any) => item.day === day)
        if (existing) {
            if (post.status === 'scheduled') existing.scheduled++
            if (post.status === 'posted') existing.posted++
        } else {
            acc.push({
                day,
                scheduled: post.status === 'scheduled' ? 1 : 0,
                posted: post.status === 'posted' ? 1 : 0,
                // Mock previous period data for visual demonstration
                scheduledPrev: Math.floor(Math.random() * 3),
                postedPrev: Math.floor(Math.random() * 3)
            })
        }
        return acc
    }, []).slice(0, 7) : []

    const safeChartData = chartData.length > 0 ? chartData : [
        { day: 'Mon', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Tue', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Wed', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Thu', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Fri', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Sat', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
        { day: 'Sun', scheduled: 0, posted: 0, scheduledPrev: 0, postedPrev: 0 },
    ]

    // 3. Calendar posts (Upcoming Scheduled)
    const { data: scheduledPosts } = await supabase
        .from('posts')
        .select('*')
        .eq('status', 'scheduled')
        .eq('workspace_id', activeWorkspace.id)
        .order('scheduled_for', { ascending: true })
        .limit(50)

    const calendarPosts = scheduledPosts?.map(p => {
        // Extract first image if available
        let mediaUrl = null
        if (Array.isArray(p.media_urls) && p.media_urls.length > 0) {
            mediaUrl = typeof p.media_urls[0] === 'string' ? p.media_urls[0] : (p.media_urls[0] as any)?.url
        }

        return {
            id: p.id,
            date: new Date(p.scheduled_for),
            platforms: Array.isArray(p.platforms) ? p.platforms : [],
            content: p.content,
            mediaUrl
        }
    }) || []

    // 4. Fetch Recent Activity (Posts + AI Generation)
    // We'll simulate fetching AI assets for now or try if table exists intypes
    // For now, let's derive activity from 'posts' and simulate AI
    const recentActivities: RecentAction[] = []

    posts?.slice(0, 5).forEach((post: any) => {
        if (post.status === 'draft') {
            recentActivities.push({
                id: Math.random().toString(),
                type: 'draft',
                description: 'Draft saved',
                timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
            })
        } else if (post.status === 'posted') {
            recentActivities.push({
                id: Math.random().toString(),
                type: 'published',
                description: 'Post published to ' + (Array.isArray(post.platforms) ? post.platforms.join(', ') : 'Socials'),
                timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
            })
        } else if (post.status === 'scheduled') {
            recentActivities.push({
                id: Math.random().toString(),
                type: 'scheduled',
                description: 'Post scheduled',
                timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
            })
        }
    })

    // Add dummy AI activity if empty or few, or mixing in
    if (recentActivities.length < 5) {
        recentActivities.push({
            id: 'ai-1',
            type: 'ai_generated',
            description: 'AI generated 5 ideas',
            timestamp: 'yesterday'
        })
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
                        Overview
                    </h2>
                    <p className="text-muted-foreground mt-1">Welcome back to your social media command center.</p>
                </div>
                <RecentActivityDropdown activities={recentActivities} />
            </div>

            <MetricsCards
                draftCount={draftCount || 0}
                scheduledCount={scheduledCount || 0}
                postedCount={postedCount || 0}
                workspaceId={activeWorkspace.id}
            />

            <QuickActions workspaceId={activeWorkspace.id} />

            {/* Dashboard Content - Always Visible */}
            <div className="space-y-6">
                <PostsChart data={safeChartData} />
                <CalendarView posts={calendarPosts} workspaceId={activeWorkspace.id} />
            </div>
        </div>
    )
}
