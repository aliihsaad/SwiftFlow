import { describe, expect, it } from "vitest"
import { recommendSlots } from "@/lib/content-intelligence/timing"
import type { ContentIntelligenceSignals } from "@/lib/content-intelligence/types"

describe("recommendSlots", () => {
  it("uses historical hourly performance when available", () => {
    const signals: ContentIntelligenceSignals = {
      brand: null,
      history: {
        totalPublishedPosts: 12,
        topPosts: [],
        hashtagPerformance: [],
        hourlyPerformance: [
          { platform: "instagram", dayOfWeek: 4, hour: 9, posts: 5, averageScore: 30 },
          { platform: "instagram", dayOfWeek: 5, hour: 18, posts: 2, averageScore: 12 },
        ],
      },
      capabilities: { hasMetaInsights: true, hasFacebookEngagement: false },
    }

    const slots = recommendSlots({ platform: "instagram", now: new Date("2026-05-13T08:00:00.000Z"), signals })

    expect(slots[0].confidence).toBe("high")
    expect(slots[0].evidence[0].sourceType).toBe("internal_analytics")
  })

  it("returns low-confidence benchmark slots without history", () => {
    const signals: ContentIntelligenceSignals = {
      brand: null,
      history: { totalPublishedPosts: 0, topPosts: [], hashtagPerformance: [], hourlyPerformance: [] },
      capabilities: { hasMetaInsights: false, hasFacebookEngagement: false },
    }

    const slots = recommendSlots({ platform: "all", now: new Date("2026-05-13T08:00:00.000Z"), signals })

    expect(slots.length).toBeGreaterThan(0)
    expect(slots[0].confidence).toBe("low")
    expect(slots[0].evidence[0].sourceType).toBe("fallback")
  })
})
