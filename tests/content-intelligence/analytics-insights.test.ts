import { describe, expect, it } from "vitest"
import { generateAnalyticsInsights } from "@/lib/content-intelligence/analytics-insights"
import type { ContentIntelligenceSignals } from "@/lib/content-intelligence/types"

describe("generateAnalyticsInsights", () => {
  it("summarizes what is working from strong internal history", () => {
    const signals: ContentIntelligenceSignals = {
      brand: null,
      history: {
        totalPublishedPosts: 12,
        topPosts: [
          {
            id: "post-1",
            platform: "instagram",
            caption: "AI is your coding assistant, not your replacement. You're the architect, it's the builder. #AIAgents #FutureOfCoding",
            publishedAt: "2026-05-07T09:00:00.000Z",
            likes: 40,
            comments: 12,
            shares: 8,
            views: 1200,
            saves: 9,
            score: 115,
            hashtags: ["#AIAgents", "#FutureOfCoding"],
          },
          {
            id: "post-2",
            platform: "instagram",
            caption: "Behind the scenes from our customer workflow #ContentStrategy",
            publishedAt: "2026-05-08T18:00:00.000Z",
            likes: 28,
            comments: 9,
            shares: 6,
            views: 900,
            saves: 2,
            score: 77,
            hashtags: ["#ContentStrategy"],
          },
        ],
        hashtagPerformance: [
          { tag: "#ContentStrategy", uses: 4, averageScore: 72, bestScore: 115 },
          { tag: "#StartupTips", uses: 2, averageScore: 66, bestScore: 115 },
        ],
        hourlyPerformance: [
          { platform: "instagram", dayOfWeek: 4, hour: 9, posts: 5, averageScore: 32 },
          { platform: "instagram", dayOfWeek: 5, hour: 18, posts: 3, averageScore: 21 },
        ],
      },
      capabilities: {
        hasMetaInsights: true,
      },
    }

    const result = generateAnalyticsInsights({ signals, platform: "all", range: "last_30_days" })

    expect(result.fallbackLevel).toBe("personalized")
    expect(result.whatIsWorking.length).toBeGreaterThan(0)
    expect(result.whatIsWorking[0].kind).toBe("what_is_working")
    expect(result.whatIsWorking[0].evidence[0].sourceType).toBe("internal_analytics")
    expect(result.patterns.map((pattern) => pattern.type)).toContain("hashtag")
    expect(result.patterns.map((pattern) => pattern.type)).toContain("time")
    expect(result.patterns.find((pattern) => pattern.type === "topic")?.value).toBe("AI agents")
  })

  it("returns low-confidence experiments when history is sparse", () => {
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
      },
    }

    const result = generateAnalyticsInsights({ signals, platform: "instagram", range: "last_7_days" })

    expect(result.fallbackLevel).toBe("benchmark")
    expect(result.whatToTryNext.length).toBeGreaterThan(0)
    expect(result.whatToTryNext[0].confidence).toBe("low")
    expect(result.whatToTryNext[0].evidence[0].sourceType).toBe("fallback")
  })
})
