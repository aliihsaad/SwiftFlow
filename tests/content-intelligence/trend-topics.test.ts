import { describe, expect, it } from "vitest"
import { suggestTrendReportTopic } from "@/lib/content-intelligence/trend-topics"
import type { AnalyticsInsightsResult } from "@/lib/content-intelligence/types"

const baseInsights: AnalyticsInsightsResult = {
  whatIsWorking: [],
  whatToTryNext: [],
  patterns: [],
  growthInsights: [],
  evidence: [],
  generatedAt: "2026-05-13T00:00:00.000Z",
  fallbackLevel: "benchmark",
}

describe("suggestTrendReportTopic", () => {
  it("prefers the top topic pattern", () => {
    const topic = suggestTrendReportTopic({
      ...baseInsights,
      patterns: [
        {
          id: "topic-1",
          type: "topic",
          title: "Topic",
          value: "AI agents",
          summary: "Strong topic",
          confidence: "high",
          evidence: [],
        },
      ],
    })

    expect(topic).toBe("AI agents")
  })

  it("uses hashtag patterns when no topic pattern exists", () => {
    const topic = suggestTrendReportTopic({
      ...baseInsights,
      patterns: [
        {
          id: "hashtag-1",
          type: "hashtag",
          title: "Hashtag",
          value: "#FutureOfCoding",
          summary: "Repeated hashtag",
          confidence: "medium",
          evidence: [],
        },
      ],
    })

    expect(topic).toBe("FutureOfCoding")
  })

  it("falls back to content strategy for empty analytics", () => {
    expect(suggestTrendReportTopic(baseInsights)).toBe("content strategy")
  })
})
