import type { AnalyticsInsightsResult, AnalyticsPatternCard } from "./types"

function cleanTopic(value: string): string {
  return value.trim().replace(/^#/, "").slice(0, 80)
}

function firstPatternValue(patterns: AnalyticsPatternCard[], type: AnalyticsPatternCard["type"]): string | null {
  const pattern = patterns.find((item) => item.type === type && item.value.trim().length > 0)
  return pattern ? cleanTopic(pattern.value) : null
}

export function suggestTrendReportTopic(data?: AnalyticsInsightsResult): string {
  if (!data) return "content strategy"

  const topic = firstPatternValue(data.patterns, "topic")
  if (topic) return topic

  const hashtag = firstPatternValue(data.patterns, "hashtag")
  if (hashtag) return hashtag

  const candidate =
    data.whatToTryNext.find((item) => item.title.trim().length > 0)?.title ||
    data.whatIsWorking.find((item) => item.title.trim().length > 0)?.title ||
    data.growthInsights.find((item) => item.title.trim().length > 0)?.title

  return candidate ? cleanTopic(candidate) : "content strategy"
}
