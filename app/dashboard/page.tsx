import { formatDistanceToNow } from "date-fns"
import { redirect } from "next/navigation"

import { CalendarView } from "@/components/dashboard/calendar-view"
import { OverviewCommandCenter } from "@/components/dashboard/overview-command-center"
import { PostsChart } from "@/components/dashboard/posts-chart"
import type { RecentAction } from "@/components/dashboard/recent-activity-dropdown"
import { canPublishWithMetaAccount, type MetaAccountMetadata } from "@/lib/meta-account"
import { isReviewPhase1Release } from "@/lib/release-channel"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { createClient } from "@/utils/supabase/server"

type DashboardPostSummary = {
    id?: string
    created_at: string
    status: string
    scheduled_for: string | null
    published_at: string | null
    content: string | null
    platforms: unknown
    media_urls?: unknown
}

type MediaUrlObject = {
    url?: string
}

type SocialAccountSummary = {
    platform: string
    account_name: string
    metadata: MetaAccountMetadata | null
}

type ChartPoint = {
    day: string
    scheduled: number
    posted: number
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        redirect("/dashboard/onboarding")
    }

    const workspaceId = activeWorkspace.id
    const [
        socialAccountsResult,
        scheduledCountResult,
        postedCountResult,
        draftCountResult,
        failedCountResult,
        postsResult,
        scheduledPostsResult,
        latestFailedPostResult,
    ] = await Promise.all([
        supabase
            .from("social_accounts")
            .select("platform, account_name, metadata")
            .eq("workspace_id", workspaceId),
        supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("status", "scheduled")
            .eq("workspace_id", workspaceId),
        supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("status", "published")
            .eq("workspace_id", workspaceId),
        supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("status", "draft")
            .eq("workspace_id", workspaceId),
        supabase
            .from("posts")
            .select("*", { count: "exact", head: true })
            .eq("status", "failed")
            .eq("workspace_id", workspaceId),
        supabase
            .from("posts")
            .select("id, created_at, status, scheduled_for, published_at, content, platforms")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(100),
        supabase
            .from("posts")
            .select("id, scheduled_for, platforms, content, media_urls, created_at, status, published_at")
            .eq("status", "scheduled")
            .eq("workspace_id", workspaceId)
            .order("scheduled_for", { ascending: true })
            .limit(50),
        supabase
            .from("posts")
            .select("id, updated_at, last_publish_error_message")
            .eq("status", "failed")
            .eq("workspace_id", workspaceId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ])

    const socialAccounts = (socialAccountsResult.data || []) as SocialAccountSummary[]
    const facebookAccount = socialAccounts.find((account) => account.platform === "facebook") || null
    const instagramAccount = socialAccounts.find((account) => account.platform === "instagram") || null
    const publishReady = Boolean(
        facebookAccount && canPublishWithMetaAccount(facebookAccount.metadata, "facebook"),
    ) || Boolean(
        instagramAccount && canPublishWithMetaAccount(instagramAccount.metadata, "instagram"),
    )

    const posts = (postsResult.data || []) as DashboardPostSummary[]
    const chartMap = buildChartRange()

    for (const post of posts) {
        if (post.status === "published" && post.published_at) {
            const key = formatChartDay(new Date(post.published_at))
            const point = chartMap.get(key)
            if (point) point.posted += 1
        } else if (post.status === "scheduled" && post.scheduled_for) {
            const key = formatChartDay(new Date(post.scheduled_for))
            const point = chartMap.get(key)
            if (point) point.scheduled += 1
        }
    }

    const calendarPosts = ((scheduledPostsResult.data as DashboardPostSummary[] | null) || [])
        .filter((post) => Boolean(post.id) && Boolean(post.scheduled_for))
        .map((post) => {
            let mediaUrl: string | null = null
            if (Array.isArray(post.media_urls) && post.media_urls.length > 0) {
                const firstMedia = post.media_urls[0]
                mediaUrl = typeof firstMedia === "string"
                    ? firstMedia
                    : (firstMedia as MediaUrlObject | null)?.url ?? null
            }

            return {
                id: post.id as string,
                date: new Date(post.scheduled_for as string),
                platforms: Array.isArray(post.platforms) ? post.platforms : [],
                content: post.content,
                mediaUrl,
            }
        })

    const recentActivities = buildRecentActivities(posts)
    const failedCount = failedCountResult.count || 0
    if (failedCount > 0 && latestFailedPostResult.data) {
        recentActivities.unshift({
            id: `failed-${latestFailedPostResult.data.id}`,
            type: "failed",
            description: latestFailedPostResult.data.last_publish_error_message || "A publish attempt needs attention",
            timestamp: formatDistanceToNow(new Date(latestFailedPostResult.data.updated_at), { addSuffix: true }),
        })
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <OverviewCommandCenter
                workspaceId={workspaceId}
                workspaceName={activeWorkspace.name}
                counts={{
                    drafts: draftCountResult.count || 0,
                    scheduled: scheduledCountResult.count || 0,
                    published: postedCountResult.count || 0,
                    failed: failedCount,
                }}
                connections={{
                    instagramName: instagramAccount?.account_name || null,
                    facebookName: facebookAccount?.account_name || null,
                    publishReady,
                }}
                latestFailure={latestFailedPostResult.data?.last_publish_error_message || null}
                activities={recentActivities.slice(0, 8)}
                isReviewPhase1Release={isReviewPhase1Release()}
            />

            <PostsChart data={Array.from(chartMap.values())} />
            <CalendarView posts={calendarPosts} workspaceId={workspaceId} />
        </div>
    )
}

function buildChartRange(): Map<string, ChartPoint> {
    const points = new Map<string, ChartPoint>()
    const today = new Date()

    for (let offset = -6; offset <= 7; offset += 1) {
        const date = new Date(today)
        date.setDate(date.getDate() + offset)
        const key = formatChartDay(date)
        points.set(key, { day: key, scheduled: 0, posted: 0 })
    }

    return points
}

function formatChartDay(date: Date) {
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" })
}

function buildRecentActivities(posts: DashboardPostSummary[]): RecentAction[] {
    return posts.slice(0, 8).reduce<RecentAction[]>((activities, post, index) => {
        const base = {
            id: `activity-${post.id || post.created_at}-${index}`,
            timestamp: formatDistanceToNow(new Date(post.created_at), { addSuffix: true }),
        }

        if (post.status === "draft") {
            activities.push({ ...base, type: "draft", description: "Draft saved" })
        }
        if (post.status === "published") {
            const platforms = Array.isArray(post.platforms) && post.platforms.length > 0
                ? post.platforms.join(", ")
                : "connected channels"
            activities.push({ ...base, type: "published", description: `Post published to ${platforms}` })
        }
        if (post.status === "scheduled") {
            activities.push({ ...base, type: "scheduled", description: "Post added to the publishing queue" })
        }
        return activities
    }, [])
}
