import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { PostsChart } from "@/components/dashboard/posts-chart"
import { CalendarView } from "@/components/dashboard/calendar-view"
import { QuickActions } from "@/components/dashboard/quick-actions"
import { RecentActivityDropdown, RecentAction } from "@/components/dashboard/recent-activity-dropdown"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { isReviewPhase1Release } from "@/lib/release-channel"
import { canPublishWithMetaAccount, MetaAccountMetadata } from "@/lib/meta-account"
import { formatDistanceToNow } from "date-fns"
import Link from "next/link"

import { redirect } from "next/navigation"

type DashboardPostSummary = {
    id: string
    created_at: string
    status: string
    scheduled_for: string | null
    published_at: string | null
    content: string | null
    platforms: unknown
    media_urls?: unknown
    last_publish_error_message?: string | null
}

type MediaUrlObject = {
    url?: string
}

type SocialAccountSummary = {
    platform: string
    account_name: string
    metadata: MetaAccountMetadata | null
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        redirect('/dashboard/onboarding')
    }
    const reviewPhase1Release = isReviewPhase1Release()
    const { data: socialAccounts } = await supabase
        .from('social_accounts')
        .select('platform, account_name, metadata')
        .eq('workspace_id', activeWorkspace.id)

    const typedSocialAccounts = (socialAccounts || []) as SocialAccountSummary[]
    const facebookAccount = typedSocialAccounts.find((account) => account.platform === 'facebook') || null
    const instagramAccount = typedSocialAccounts.find((account) => account.platform === 'instagram') || null
    const publishReady = Boolean(
        facebookAccount && canPublishWithMetaAccount(facebookAccount.metadata, 'facebook')
    ) || Boolean(
        instagramAccount && canPublishWithMetaAccount(instagramAccount.metadata, 'instagram')
    )

    // 1. Fetch Counts
    const { count: scheduledCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .eq('workspace_id', activeWorkspace.id)

    const { count: postedCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'published')
        .eq('workspace_id', activeWorkspace.id)

    // Draft counts
    const { count: draftCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft')
        .eq('workspace_id', activeWorkspace.id)

    const { count: failedCount } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
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
            if (post.status === 'published' && post.published_at) {
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

    const { data: latestFailedPost } = await supabase
        .from('posts')
        .select('id, updated_at, last_publish_error_message')
        .eq('status', 'failed')
        .eq('workspace_id', activeWorkspace.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    const calendarPosts = ((scheduledPosts as DashboardPostSummary[] | null) || [])
        .filter((p) => Boolean(p.id) && Boolean(p.scheduled_for))
        .map((p) => {
            // Extract first image if available
            let mediaUrl = null
            if (Array.isArray(p.media_urls) && p.media_urls.length > 0) {
                const firstMedia = p.media_urls[0]
                mediaUrl = typeof firstMedia === 'string' ? firstMedia : (firstMedia as MediaUrlObject | null)?.url ?? null
            }

            return {
                id: p.id,
                date: new Date(p.scheduled_for as string),
                platforms: Array.isArray(p.platforms) ? p.platforms : [],
                content: p.content,
                mediaUrl
            }
        })

    // 4. Fetch Recent Activity (Posts + AI Generation)
    // We'll simulate fetching AI assets for now or try if table exists intypes
    // For now, let's derive activity from 'posts' and simulate AI
    const recentActivities: RecentAction[] = []

    ;((posts as DashboardPostSummary[] | null) || []).slice(0, 5).forEach((post, index) => {
        const activityId = `activity-${post.created_at}-${post.status}-${index}`
        if (post.status === 'draft') {
            recentActivities.push({
                id: activityId,
                type: 'draft',
                description: 'Draft saved',
                timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
            })
        } else if (post.status === 'published') {
            recentActivities.push({
                id: activityId,
                type: 'published',
                description: 'Post published to ' + (Array.isArray(post.platforms) ? post.platforms.join(', ') : 'Socials'),
                timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
            })
        } else if (post.status === 'scheduled') {
            recentActivities.push({
                id: activityId,
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
        <div className="space-y-5 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <div
                        className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] mb-3"
                        style={{
                            background: "rgba(34,211,238,0.06)",
                            border: "1px solid rgba(34,211,238,0.16)",
                            color: "rgba(255,255,255,0.78)",
                        }}
                    >
                        Dashboard
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.92)' }}>
                        Overview
                    </h2>
                    <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.42)' }}>
                        Welcome back to your social media command center.
                    </p>
                </div>
                <RecentActivityDropdown activities={recentActivities} />
            </div>

            {reviewPhase1Release && (
                <div
                    className="rounded-2xl border p-4 sm:p-5"
                    style={{
                        background: "linear-gradient(135deg, rgba(34,211,238,0.08), rgba(245,158,11,0.08))",
                        borderColor: "rgba(255,255,255,0.08)",
                    }}
                >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="space-y-2">
                            <div
                                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                                style={{
                                    background: "rgba(245,158,11,0.12)",
                                    border: "1px solid rgba(245,158,11,0.22)",
                                    color: "rgba(255,244,214,0.9)",
                                }}
                            >
                                Meta Review Path
                            </div>
                            <h3 className="text-lg font-semibold text-white/90">Reviewer-safe Phase 1 release</h3>
                            <p className="max-w-2xl text-sm text-white/65">
                                This deployment only demonstrates connection, post creation, immediate publishing, and scheduled publishing.
                                Messaging, comments, analytics, automation, and subscription flows stay hidden in this release.
                            </p>
                            <div className="grid gap-2 text-sm text-white/72 sm:grid-cols-3">
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">1. Connect Facebook Page and linked Instagram account</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">2. Create a post from the quick actions below</div>
                                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">3. Publish now or schedule for later</div>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/dashboard/settings/brand"
                                className="inline-flex items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/15"
                            >
                                Open Brand Profile
                            </Link>
                            <Link
                                href="/privacy"
                                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10"
                            >
                                Privacy Policy
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            <div
                className="rounded-2xl border p-4 sm:p-5"
                style={{
                    background: "rgba(255,255,255,0.03)",
                    borderColor: "rgba(255,255,255,0.08)",
                }}
            >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white/90">Integration Health</h3>
                        <p className="text-sm text-white/55">
                            Review-ready publishing depends on a connected Page, a linked Instagram business account, and granted publish capabilities.
                        </p>
                    </div>
                    <Link
                        href="/dashboard/settings/brand"
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/75 transition hover:bg-white/10"
                    >
                        Manage Connections
                    </Link>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {[
                        {
                            label: "Facebook Page",
                            status: facebookAccount ? "Connected" : "Missing",
                            detail: facebookAccount ? facebookAccount.account_name : "No Page connected to this workspace",
                            tone: facebookAccount ? "emerald" : "amber",
                        },
                        {
                            label: "Instagram Business",
                            status: instagramAccount ? "Connected" : "Missing",
                            detail: instagramAccount ? instagramAccount.account_name : "No linked Instagram business account stored",
                            tone: instagramAccount ? "emerald" : "amber",
                        },
                        {
                            label: "Publish Readiness",
                            status: publishReady ? "Ready" : "Needs Attention",
                            detail: publishReady
                                ? "At least one connected platform can publish with the granted capabilities."
                                : "Reconnect the account or verify granted publish permissions before reviewer testing.",
                            tone: publishReady ? "cyan" : "amber",
                        },
                    ].map((item) => (
                        <div
                            key={item.label}
                            className="rounded-xl border p-3"
                            style={{
                                borderColor:
                                    item.tone === "emerald"
                                        ? "rgba(52,211,153,0.2)"
                                        : item.tone === "cyan"
                                            ? "rgba(34,211,238,0.2)"
                                            : "rgba(245,158,11,0.22)",
                                background:
                                    item.tone === "emerald"
                                        ? "rgba(52,211,153,0.08)"
                                        : item.tone === "cyan"
                                            ? "rgba(34,211,238,0.08)"
                                            : "rgba(245,158,11,0.08)",
                            }}
                        >
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-white/45">{item.label}</div>
                            <div className="mt-2 text-base font-semibold text-white/88">{item.status}</div>
                            <p className="mt-1 text-sm text-white/60">{item.detail}</p>
                        </div>
                    ))}
                </div>

                {(failedCount || 0) > 0 && (
                    <div
                        className="mt-4 rounded-xl border p-3"
                        style={{
                            background: 'rgba(248,113,113,0.08)',
                            borderColor: 'rgba(248,113,113,0.18)',
                        }}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1">
                                <div className="text-sm font-semibold text-red-100/90">
                                    {failedCount} post{failedCount === 1 ? '' : 's'} need{failedCount === 1 ? 's' : ''} attention
                                </div>
                                <p className="text-sm text-red-100/80">
                                    {latestFailedPost?.last_publish_error_message || 'A recent publish attempt failed. Open the Failed tab to review the platform-specific reason and retry safely.'}
                                </p>
                            </div>
                            <Link
                                href="/dashboard/scheduled?tab=failed"
                                className="inline-flex items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition hover:bg-red-500/15"
                            >
                                Review Failed Posts
                            </Link>
                        </div>
                    </div>
                )}
            </div>

            <MetricsCards
                draftCount={draftCount || 0}
                scheduledCount={scheduledCount || 0}
                postedCount={postedCount || 0}
                workspaceId={activeWorkspace.id}
            />

            <QuickActions workspaceId={activeWorkspace.id} isReviewPhase1Release={reviewPhase1Release} />

            {/* Dashboard Content - Always Visible */}
            <div className="space-y-6">
                <PostsChart data={safeChartData} />
                <CalendarView posts={calendarPosts} workspaceId={activeWorkspace.id} />
            </div>
        </div>
    )
}
