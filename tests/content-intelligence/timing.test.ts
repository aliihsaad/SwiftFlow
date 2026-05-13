import { describe, expect, it } from "vitest"
import { classifySlotStrength, recommendCalendarSlots, recommendSlots } from "@/lib/content-intelligence/timing"
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

  it("returns range-based calendar slots and excludes past times", () => {
    const signals: ContentIntelligenceSignals = {
      brand: null,
      history: {
        totalPublishedPosts: 10,
        topPosts: [],
        hashtagPerformance: [],
        hourlyPerformance: [
          { platform: "instagram", dayOfWeek: 4, hour: 9, posts: 6, averageScore: 28 },
          { platform: "instagram", dayOfWeek: 5, hour: 18, posts: 2, averageScore: 12 },
        ],
      },
      capabilities: { hasMetaInsights: true, hasFacebookEngagement: false },
    }

    const slots = recommendCalendarSlots({
      platform: "instagram",
      now: new Date("2026-05-13T12:00:00.000Z"),
      startDate: new Date("2026-05-13T00:00:00.000Z"),
      endDate: new Date("2026-05-16T23:59:59.999Z"),
      signals,
      limitPerDay: 2,
    })

    expect(slots.length).toBeGreaterThanOrEqual(2)
    expect(slots.every((slot) => new Date(slot.startsAt) > new Date("2026-05-13T12:00:00.000Z"))).toBe(true)
    expect(slots.some((slot) => slot.confidence === "high")).toBe(true)
  })

  it("classifies dropped scheduled times against recommended calendar slots", () => {
    const recommendedAt = "2026-05-14T09:00:00.000Z"
    const slots = [
      {
        startsAt: recommendedAt,
        platform: "instagram" as const,
        score: 91,
        confidence: "high" as const,
        reason: "Strong history.",
        evidence: [],
      },
    ]

    expect(classifySlotStrength(new Date("2026-05-14T09:15:00.000Z"), slots)).toEqual({
      label: "strong",
      score: 91,
      confidence: "high",
      nearestSlot: recommendedAt,
    })
    expect(classifySlotStrength(new Date("2026-05-14T23:00:00.000Z"), slots).label).toBe("weak")
  })
})
