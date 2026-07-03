import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const accountId = "22222222-2222-4222-8222-222222222222"
const publishedPostId = "33333333-3333-4333-8333-333333333333"

const state = vi.hoisted(() => ({
  requiredScopes: [] as string[],
  accounts: [] as Array<Record<string, unknown>>,
  posts: [] as Array<Record<string, unknown>>,
  accountAnalytics: [] as Array<Record<string, unknown>>,
  publishedPosts: [] as Array<Record<string, unknown>>,
  postAnalytics: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/developer-api/http", () => ({
  withDeveloperApiAuth: async (
    _request: Request,
    config: { requiredScopes: string[] },
    handler: (context: { workspaceId: string }) => Promise<NextResponse>,
  ) => {
    state.requiredScopes = [...config.requiredScopes]
    return handler({ workspaceId })
  },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createQuery(table),
  }),
}))

function tableRows(table: string): Array<Record<string, unknown>> {
  switch (table) {
    case "social_accounts":
      return state.accounts
    case "posts":
      return state.posts
    case "account_analytics":
      return state.accountAnalytics
    case "published_posts":
      return state.publishedPosts
    case "post_analytics":
      return state.postAnalytics
    default:
      return []
  }
}

function projectRows(rows: Array<Record<string, unknown>>, selectValue: string | null): Array<Record<string, unknown>> {
  if (!selectValue || selectValue === "*") return rows.map((row) => ({ ...row }))
  const fields = selectValue.split(",").map((field) => field.trim()).filter(Boolean)
  return rows.map((row) => {
    const projected: Record<string, unknown> = {}
    for (const field of fields) {
      if (field in row) projected[field] = row[field]
    }
    return projected
  })
}

function createQuery(table: string) {
  let rows = tableRows(table)
  let selectValue: string | null = null

  const query = {
    select: vi.fn((value: string) => {
      selectValue = value
      return query
    }),
    eq: vi.fn((key: string, value: unknown) => {
      rows = rows.filter((row) => row[key] === value)
      return query
    }),
    in: vi.fn((key: string, values: unknown[]) => {
      rows = rows.filter((row) => values.includes(row[key]))
      return query
    }),
    order: vi.fn((key: string, options?: { ascending?: boolean }) => {
      rows = [...rows].sort((a, b) => {
        const left = String(a[key] || "")
        const right = String(b[key] || "")
        return options?.ascending === false ? right.localeCompare(left) : left.localeCompare(right)
      })
      return query
    }),
    limit: vi.fn((count: number) => {
      rows = rows.slice(0, count)
      return Promise.resolve({ data: projectRows(rows, selectValue), error: null })
    }),
    then: (resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => unknown) =>
      resolve({ data: projectRows(rows, selectValue), error: null }),
  }

  return query
}

import * as analyticsSummaryRoute from "@/app/api/developer/v1/analytics/summary/route"

const origin = "https://social.swiftdigital-s.com"

describe("developer API analytics summary route", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("SUPABASE_SERVICE_KEY", "service-role-key")
    state.requiredScopes = []
    state.accounts = [{
      id: accountId,
      platform: "instagram",
      account_name: "Aldievlab",
      workspace_id: workspaceId,
    }]
    state.posts = [
      { id: "post-draft", workspace_id: workspaceId, status: "draft" },
      { id: "post-scheduled", workspace_id: workspaceId, status: "scheduled" },
    ]
    state.accountAnalytics = [{
      social_account_id: accountId,
      date: "2026-05-14",
      followers: 83,
      following: 20,
      posts_count: 42,
      avg_engagement_rate: 3.5,
    }]
    state.publishedPosts = [{
      id: publishedPostId,
      social_account_id: accountId,
      platform: "instagram",
      published_at: "2026-05-14T08:00:00.000Z",
    }]
    state.postAnalytics = [{
      published_post_id: publishedPostId,
      views: 120,
      likes: 12,
      comments: 3,
      shares: 2,
      saves: 4,
      engagement_rate: 17.5,
      synced_at: "2000-01-01T00:00:00.000Z",
    }]
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      success: true,
      posts: { synced: 1 },
      accounts: { synced: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } })))
  })

  it("refreshes stale analytics through the sync Edge Function before returning the summary", async () => {
    const response = await analyticsSummaryRoute.GET(new NextRequest(`${origin}/api/developer/v1/analytics/summary`))

    expect(response.status).toBe(200)
    expect(state.requiredScopes).toEqual(["analytics:read"])
    expect(fetch).toHaveBeenCalledWith(
      "https://project.supabase.co/functions/v1/sync-analytics",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "service-role-key",
        }),
        body: JSON.stringify({ workspaceId }),
      }),
    )
    await expect(response.json()).resolves.toMatchObject({
      totals: {
        connectedAccounts: 1,
        draftPosts: 1,
        scheduledPosts: 1,
        publishedPosts: 1,
        views: 120,
        likes: 12,
      },
      _meta: {
        analyticsSync: {
          attempted: true,
          success: true,
          reason: "synced",
        },
      },
    })
  })

  it("returns cached analytics with sync metadata if the read-through sync fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "Meta temporarily unavailable",
    }), { status: 502, headers: { "content-type": "application/json" } })))

    const response = await analyticsSummaryRoute.GET(new NextRequest(`${origin}/api/developer/v1/analytics/summary`))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      totals: {
        views: 120,
        likes: 12,
      },
      _meta: {
        analyticsSync: {
          attempted: true,
          success: false,
          reason: "sync_failed",
          status: 502,
        },
      },
    })
  })

  it("uses the cached summary without syncing again when analytics were refreshed recently", async () => {
    state.postAnalytics[0].synced_at = "2999-01-01T00:00:00.000Z"

    const response = await analyticsSummaryRoute.GET(new NextRequest(`${origin}/api/developer/v1/analytics/summary`))

    expect(response.status).toBe(200)
    expect(fetch).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      _meta: {
        analyticsSync: {
          attempted: false,
          success: true,
          skipped: true,
          reason: "fresh_cache",
        },
      },
    })
  })
})
