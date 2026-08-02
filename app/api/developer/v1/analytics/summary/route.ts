import { NextRequest, NextResponse } from "next/server"
import { maybeSyncWorkspaceAnalytics } from "@/lib/analytics/read-through-sync"
import { createAdminClient } from "@/utils/supabase/admin"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

export const runtime = "nodejs"
export const maxDuration = 60

function sum(rows: Record<string, unknown>[], key: string): number {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0)
}

export async function GET(request: NextRequest) {
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["analytics:read"],
      rateLimit: "analytics_refresh",
      action: "analytics.summary.read",
      route: "/api/developer/v1/analytics/summary",
    },
    async (context) => {
      const admin = createAdminClient()
      const { data: accounts, error: accountsError } = await admin
        .from("social_accounts")
        .select("id, platform, account_name")
        .eq("workspace_id", context.workspaceId)

      if (accountsError) return NextResponse.json({ error: accountsError.message }, { status: 500 })

      const accountIds = (accounts || []).map((account: { id: string }) => account.id)
      const analyticsSync = await maybeSyncWorkspaceAnalytics({
        workspaceId: context.workspaceId,
        accountIds,
        admin,
      })

      const { data: accountAnalytics } = accountIds.length
        ? await admin
          .from("account_analytics")
          .select("social_account_id, date, followers, following, posts_count, avg_engagement_rate")
          .in("social_account_id", accountIds)
          .order("date", { ascending: false })
          .limit(100)
        : { data: [] }

      const { data: publishedPosts } = accountIds.length
        ? await admin
          .from("published_posts")
          .select("id, platform, published_at, social_account_id")
          .in("social_account_id", accountIds)
          .limit(500)
        : { data: [] }

      const publishedPostIds = (publishedPosts || []).map((post: { id: string }) => post.id)
      const { data: postAnalytics } = publishedPostIds.length
        ? await admin
          .from("post_analytics")
          .select("published_post_id, views, likes, comments, shares, saves, engagement_rate, synced_at")
          .in("published_post_id", publishedPostIds)
          .limit(500)
        : { data: [] }

      const analyticsRows = (postAnalytics || []) as Record<string, unknown>[]
      return NextResponse.json({
        totals: {
          connectedAccounts: accountIds.length,
          publishedPosts: (publishedPosts || []).length,
          views: sum(analyticsRows, "views"),
          likes: sum(analyticsRows, "likes"),
          comments: sum(analyticsRows, "comments"),
          shares: sum(analyticsRows, "shares"),
          saves: sum(analyticsRows, "saves"),
        },
        accounts: accounts || [],
        latestAccountAnalytics: accountAnalytics || [],
        generatedAt: new Date().toISOString(),
        _meta: {
          analyticsSync,
        },
      })
    },
  )
}
