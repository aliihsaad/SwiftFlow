import { fallbackEvidence, internalEvidence } from "./evidence"
import type {
  ContentIntelligenceSignals,
  ContentPlatform,
  IntelligenceConfidence,
  RecommendedSlot,
  SlotStrengthLabel,
} from "./types"

const BENCHMARK_HOURS = [9, 12, 18]
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function startOfUtcDay(date: Date): Date {
  const result = new Date(date)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

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

function confidenceForPosts(posts: number): IntelligenceConfidence {
  if (posts >= 5) return "high"
  if (posts >= 2) return "medium"
  return "low"
}

function slotFromHistory(params: {
  platform: ContentPlatform | "all"
  rowPlatform: ContentPlatform
  day: Date
  hour: number
  posts: number
  averageScore: number
}): RecommendedSlot {
  const startsAt = new Date(params.day)
  startsAt.setUTCHours(params.hour, 0, 0, 0)
  return {
    startsAt: startsAt.toISOString(),
    platform: params.platform === "all" ? "all" : params.rowPlatform,
    score: clampScore(70 + params.averageScore),
    confidence: confidenceForPosts(params.posts),
    reason: `Historically stronger ${params.rowPlatform} posts were published around ${String(params.hour).padStart(2, "0")}:00 UTC.`,
    evidence: [internalEvidence(`Based on ${params.posts} prior posts in this day/hour window.`, params.posts)],
  }
}

function benchmarkSlot(platform: ContentPlatform | "all", day: Date, hour: number, index: number): RecommendedSlot {
  const startsAt = new Date(day)
  startsAt.setUTCHours(hour, 0, 0, 0)
  return {
    startsAt: startsAt.toISOString(),
    platform,
    score: 58 - index * 3,
    confidence: "low",
    reason: "Limited workspace history; using conservative benchmark posting windows.",
    evidence: [fallbackEvidence("No reliable day/hour performance history was available.")],
  }
}

export function recommendCalendarSlots(params: {
  platform: ContentPlatform | "all"
  now: Date
  startDate: Date
  endDate: Date
  signals: ContentIntelligenceSignals
  limitPerDay?: number
}): RecommendedSlot[] {
  const { platform, now, signals } = params
  const limitPerDay = Math.max(1, Math.min(params.limitPerDay ?? 2, 3))
  const start = startOfUtcDay(params.startDate)
  const end = startOfUtcDay(params.endDate)
  const historyRows = signals.history.hourlyPerformance
    .filter((row) => platform === "all" || row.platform === platform)
    .filter((row) => row.posts > 0)
    .sort((a, b) => b.averageScore - a.averageScore)

  const slots: RecommendedSlot[] = []
  for (let day = new Date(start); day <= end; day = new Date(day.getTime() + MS_PER_DAY)) {
    const dayRows = historyRows.filter((row) => row.dayOfWeek === day.getUTCDay()).slice(0, limitPerDay)
    const daySlots = dayRows.length > 0
      ? dayRows.map((row) => slotFromHistory({
          platform,
          rowPlatform: row.platform,
          day,
          hour: row.hour,
          posts: row.posts,
          averageScore: row.averageScore,
        }))
      : BENCHMARK_HOURS.slice(0, limitPerDay).map((hour, index) => benchmarkSlot(platform, day, hour, index))

    slots.push(...daySlots.filter((slot) => new Date(slot.startsAt) > now))
  }

  return slots.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
}

export function classifySlotStrength(
  scheduledAt: Date,
  recommendedSlots: RecommendedSlot[],
): { label: SlotStrengthLabel; score: number; confidence: IntelligenceConfidence; nearestSlot: string | null } {
  const target = scheduledAt.getTime()
  let nearest: RecommendedSlot | null = null
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const slot of recommendedSlots) {
    const distance = Math.abs(new Date(slot.startsAt).getTime() - target)
    if (distance < nearestDistance) {
      nearest = slot
      nearestDistance = distance
    }
  }

  if (!nearest) {
    return { label: "weak", score: 0, confidence: "low", nearestSlot: null }
  }

  const closeEnough = nearestDistance <= MS_PER_HOUR
  const label: SlotStrengthLabel = closeEnough && nearest.score >= 80 ? "strong" : closeEnough && nearest.score >= 60 ? "okay" : "weak"

  return {
    label,
    score: nearest.score,
    confidence: nearest.confidence,
    nearestSlot: nearest.startsAt,
  }
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
    return platformRows.slice(0, 3).map((row) =>
      slotFromHistory({
        platform,
        rowPlatform: row.platform,
        day: nextDateFor(row.dayOfWeek, row.hour, now),
        hour: row.hour,
        posts: row.posts,
        averageScore: row.averageScore,
      })
    )
  }

  return BENCHMARK_HOURS.map((hour, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() + (index === 0 ? 1 : index + 1))
    date.setUTCHours(hour, 0, 0, 0)
    return benchmarkSlot(platform, date, hour, index)
  })
}
