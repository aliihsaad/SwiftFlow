import { describe, expect, it } from "vitest"
import { buildContentIntelligenceSignals } from "@/lib/content-intelligence/internal-signals"

describe("buildContentIntelligenceSignals", () => {
  it("ignores legacy Facebook rows and builds signals only from Instagram posts", () => {
    const instagramPosts = Array.from({ length: 12 }, (_, index) => ({
      id: `ig-${index}`,
      platform: "instagram",
      platform_caption: `Instagram post ${index} #AIAgents`,
      published_at: `2026-05-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    }))
    const facebookPosts = Array.from({ length: 3 }, (_, index) => ({
      id: `fb-${index}`,
      platform: "facebook",
      platform_caption: `Facebook page post ${index} #PageGrowth`,
      published_at: `2026-05-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
    }))
    const postAnalytics = [
      ...instagramPosts.map((post, index) => ({
        published_post_id: post.id,
        likes: 100 - index,
        comments: 20,
        shares: 10,
        views: 2000,
      })),
      ...facebookPosts.map((post, index) => ({
        published_post_id: post.id,
        likes: 5 - index,
        comments: 1,
        shares: 0,
        views: 100,
      })),
    ]

    const signals = buildContentIntelligenceSignals({
      brandProfile: null,
      publishedPosts: [...instagramPosts, ...facebookPosts],
      postAnalytics,
      socialAccounts: [],
    })

    expect(signals.history.totalPublishedPosts).toBe(instagramPosts.length)
    expect(signals.history.topPosts).toHaveLength(instagramPosts.length)
    expect(signals.history.topPosts.every((post) => post.platform === "instagram")).toBe(true)
  })
})
