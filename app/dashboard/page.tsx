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
        .select('created_at, status, scheduled_for, published_at, content, platforms')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(100)

    // Generate last 7 days + next 7 days
    const dates = []
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        dates.push(d)
    }
    for (let i = 1; i <= 7; i++) {
        const d = new Date(today)
        d.setDate(d.getDate() + i)
        dates.push(d)
    }

    // Aggregate data for chart
    const chartMap = new Map()
    dates.forEach(date => {
        const key = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
        chartMap.set(key, { day: key, scheduled: 0, posted: 0 })
    })

    if (posts) {
        posts.forEach(post => {
            let dateKey = ''
            if (post.status === 'posted' && post.published_at) {
                dateKey = new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                if (chartMap.has(dateKey)) {
                    chartMap.get(dateKey).posted++
                }
            } else if (post.status === 'scheduled' && post.scheduled_for) {
                dateKey = new Date(post.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
                if (chartMap.has(dateKey)) {
                    chartMap.get(dateKey).scheduled++
                }
            }
        })
    }

    const safeChartData = Array.from(chartMap.values())

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
                    <h2 className="text-3xl font-bold tracking-tight bg-linear-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent dark:from-white dark:to-gray-400">
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
