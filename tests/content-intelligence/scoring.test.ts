import { describe, expect, it } from "vitest"
import { scorePostStrength } from "@/lib/content-intelligence/scoring"
import type { ContentIntelligenceSignals, PostIntelligenceInput } from "@/lib/content-intelligence/types"

describe("scorePostStrength", () => {
  it("returns a weak score and actionable fixes for an empty Instagram post", () => {
    const input: PostIntelligenceInput = {
      workspaceId: "workspace-1",
      caption: "",
      platforms: ["instagram"],
      mediaUrls: [],
      scheduledAt: null,
    }
    const signals: ContentIntelligenceSignals = {
      brand: null,
      history: {
        totalPublishedPosts: 0,
        topPosts: [],
        hashtagPerformance: [],
        hourlyPerformance: [],
      },
      capabilities: {
        hasMetaInsights: false,
        hasFacebookEngagement: false,
      },
    }

    const result = scorePostStrength(input, signals)

    expect(result.score).toBeLessThan(50)
    expect(result.band).toBe("weak")
    expect(result.topFixes.map((fix) => fix.id)).toContain("instagram-media-required")
  })

  it("rewards a complete on-brand post with media and clear hook", () => {
    const input: PostIntelligenceInput = {
      workspaceId: "workspace-1",
      caption: "Save this 5-step checklist before planning your next campaign. Which step do you skip most often? #ContentStrategy #SmallBusiness",
      platforms: ["instagram"],
      mediaUrls: ["https://example.com/post.jpg"],
      scheduledAt: new Date("2026-05-14T09:00:00.000Z").toISOString(),
    }
    const signals: ContentIntelligenceSignals = {
      brand: {
        businessName: "SwiftFlow",
        industry: "social media software",
        targetAudience: "small businesses",
        brandVoice: "professional",
        language: "en",
        contentThemes: ["content strategy", "automation"],
        services: ["social scheduling"],
        uniqueSellingPoints: ["AI assisted planning"],
      },
      history: {
        totalPublishedPosts: 8,
        topPosts: [],
        hashtagPerformance: [{ tag: "#ContentStrategy", uses: 2, averageScore: 18, bestScore: 32 }],
        hourlyPerformance: [{ platform: "instagram", dayOfWeek: 4, hour: 9, posts: 3, averageScore: 25 }],
      },
      capabilities: {
        hasMetaInsights: true,
        hasFacebookEngagement: false,
      },
    }

    const result = scorePostStrength(input, signals)

    expect(result.score).toBeGreaterThanOrEqual(70)
    expect(["good", "strong"]).toContain(result.band)
    expect(result.topFixes.length).toBeLessThanOrEqual(3)
  })
})
