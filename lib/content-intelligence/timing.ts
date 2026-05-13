import { fallbackEvidence, internalEvidence } from "./evidence"
import type { ContentIntelligenceSignals, ContentPlatform, RecommendedSlot } from "./types"

const BENCHMARK_HOURS = [9, 12, 18]

function nextDateFor(dayOfWeek: number, hour: number, now: Date): Date {
  const result = new Date(now)
  result.setUTCMinutes(0, 0, 0)
  result.setUTCHours(hour)
  const currentDay = result.getUTCDay()
  let addDays = (dayOfWeek - currentDay + 7) % 7
  if (addDays === 0 && result <= now) addDays = 7
  result.setUTCDate(result.getUTCDate() + addDays)
  return result
}

export function recommendSlots(params: {
  platform: ContentPlatform | "all"
  now: Date
  signals: ContentIntelligenceSignals
}): RecommendedSlot[] {
  const { platform, now, signals } = params
  const platformRows = signals.history.hourlyPerformance
    .filter((row) => platform === "all" || row.platform === platform)
    .filter((row) => row.posts > 0)
    .sort((a, b) => b.averageScore - a.averageScore)

  if (platformRows.length > 0) {
    return platformRows.slice(0, 3).map((row) => ({
      startsAt: nextDateFor(row.dayOfWeek, row.hour, now).toISOString(),
      platform: platform === "all" ? "all" : row.platform,
      score: Math.min(100, Math.round(70 + row.averageScore)),
      confidence: row.posts >= 5 ? "high" : "medium",
      reason: `Historically stronger ${row.platform} posts were published around ${String(row.hour).padStart(2, "0")}:00 UTC.`,
      evidence: [internalEvidence(`Based on ${row.posts} prior posts in this day/hour window.`, row.posts)],
    }))
  }

  return BENCHMARK_HOURS.map((hour, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() + (index === 0 ? 1 : index + 1))
    date.setUTCHours(hour, 0, 0, 0)
    return {
      startsAt: date.toISOString(),
      platform,
      score: 55 - index * 3,
      confidence: "low" as const,
      reason: "Limited workspace history; using conservative benchmark posting windows.",
      evidence: [fallbackEvidence("No reliable day/hour performance history was available.")],
    }
  })
}
