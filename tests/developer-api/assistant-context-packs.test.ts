import { beforeEach, describe, expect, it, vi } from "vitest"

import { buildAssistantContext } from "@/lib/assistant/context-packs"

vi.mock("@/lib/analytics/read-through-sync", () => ({
  maybeSyncWorkspaceAnalytics: vi.fn(async () => ({
    attempted: false,
    success: true,
    skipped: true,
    reason: "fresh_cache",
    checkedAt: "2026-05-15T00:00:00.000Z",
    staleAfterSeconds: 900,
    latestSyncedAt: "2026-05-15T00:00:00.000Z",
  })),
}))

const workspaceId = "workspace-1"

const state = {
  workspace_brand_profiles: [{
    workspace_id: workspaceId,
    business_name: "Aldievlab",
    industry: "AI SaaS",
    brand_voice: "professional",
    language: "en",
    target_audience: "technical founders",
    business_description: "AI-first studio",
    services: ["SaaS builds"],
    unique_selling_points: ["Builder credibility"],
    content_themes: ["AI workflows"],
    brand_colors: { enabled: true, primary: "#050505", secondary: "#A1A1AA", accent: "#00E5FF" },
  }],
  social_accounts: [{
    id: "acc-1",
    workspace_id: workspaceId,
    platform: "instagram",
    account_name: "Aldievlab",
    account_id: "ig-1",
    metadata: { capabilities: { analytics_read: true } },
  }],
  posts: [{
    id: "post-1",
    workspace_id: workspaceId,
    content: "A strong post",
    media_urls: ["https://x/img.png"],
    platforms: ["instagram"],
    status: "scheduled",
    scheduled_for: "2026-05-19T18:00:00.000Z",
    published_at: null,
    updated_at: "2026-05-15T00:00:00.000Z",
    created_at: "2026-05-15T00:00:00.000Z",
  }],
  automations: [{
    id: "auto-1",
    workspace_id: workspaceId,
    name: "Comment reply",
    type: "comment_to_dm",
    is_active: true,
    total_triggered: 12,
    total_dms_sent: 9,
    updated_at: "2026-05-15T00:00:00.000Z",
    created_at: "2026-05-15T00:00:00.000Z",
  }],
  published_posts: [{
    id: "pub-1",
    social_account_id: "acc-1",
    platform: "instagram",
    published_at: "2026-05-14T08:00:00.000Z",
  }],
  post_analytics: [{
    published_post_id: "pub-1",
    views: 100,
    likes: 10,
    comments: 3,
    shares: 2,
    saves: 4,
  }],
} as Record<string, Array<Record<string, unknown>>>

function fakeAdmin() {
  return {
    from(table: string) {
      let rows = [...(state[table] || [])]
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((key: string, value: unknown) => {
          rows = rows.filter((row) => row[key] === value)
          return query
        }),
        in: vi.fn((key: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[key]))
          return query
        }),
        order: vi.fn(() => query),
        limit: vi.fn(() => Promise.resolve({ data: rows, error: null })),
        maybeSingle: vi.fn(() => Promise.resolve({ data: rows[0] || null, error: null })),
      }
      return query
    },
  }
}

describe("buildAssistantContext", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds analyze context with brand, accounts, analytics, and content", async () => {
    const context = await buildAssistantContext({
      workspaceId,
      mode: "analyze",
      action: "analyze_workspace",
      admin: fakeAdmin() as never,
    })

    expect(context.requestedKinds).toEqual(["brand", "accounts", "analytics", "content"])
    expect(context.brand?.businessName).toBe("Aldievlab")
    expect(context.accounts?.connectedCount).toBe(1)
    expect(context.content?.recentPosts[0]).toMatchObject({ id: "post-1", status: "scheduled", mediaCount: 1 })
    expect(context.analytics?.totals).toMatchObject({ views: 100, likes: 10, publishedPosts: 1 })
  })

  it("builds automation context without analytics", async () => {
    const context = await buildAssistantContext({
      workspaceId,
      mode: "operate",
      action: "inspect_automations",
      admin: fakeAdmin() as never,
    })

    expect(context.requestedKinds).toEqual(["brand", "accounts", "automations"])
    expect(context.analytics).toBeUndefined()
    expect(context.automations?.activeCount).toBe(1)
  })
})
