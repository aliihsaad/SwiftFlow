import { describe, expect, it } from "vitest"
import { recommendHashtags } from "@/lib/content-intelligence/hashtags"
import type { ContentIntelligenceSignals, PostIntelligenceInput } from "@/lib/content-intelligence/types"

const signals: ContentIntelligenceSignals = {
  brand: {
    businessName: "SwiftFlow",
    industry: "social media software",
    targetAudience: "small business owners",
    brandVoice: "professional",
    language: "en",
    contentThemes: ["content strategy", "automation"],
    services: ["social scheduling"],
    uniqueSellingPoints: ["AI assisted planning"],
  },
  history: {
    totalPublishedPosts: 4,
    topPosts: [],
    hashtagPerformance: [{ tag: "#ContentStrategy", uses: 3, averageScore: 20, bestScore: 35 }],
    hourlyPerformance: [],
  },
  capabilities: { hasMetaInsights: true, hasFacebookEngagement: false },
}

describe("recommendHashtags", () => {
  it("returns five or fewer focused Instagram hashtags with reasons", () => {
    const input: PostIntelligenceInput = {
      workspaceId: "workspace-1",
      caption: "Planning better campaigns with automation and content strategy for small businesses.",
      platforms: ["instagram"],
      mediaUrls: ["https://example.com/post.jpg"],
      scheduledAt: null,
    }

    const tags = recommendHashtags(input, signals)

    expect(tags.length).toBeLessThanOrEqual(5)
    expect(tags.map((tag) => tag.tag)).toContain("#ContentStrategy")
    expect(tags.every((tag) => tag.reason.length > 0)).toBe(true)
  })
})
