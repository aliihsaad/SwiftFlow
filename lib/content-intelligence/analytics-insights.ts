import { fallbackEvidence, internalEvidence } from "./evidence"
import type {
  AnalyticsExperiment,
  AnalyticsInsightCard,
  AnalyticsInsightsResult,
  AnalyticsPatternCard,
  ContentIntelligenceSignals,
  ContentPlatform,
  HistoricalPostSignal,
  HourlyPerformanceSignal,
  IntelligenceEvidence,
} from "./types"

type AnalyticsRange = "last_7_days" | "last_30_days" | "last_90_days"

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "before",
  "behind",
  "brand",
  "checklist",
  "content",
  "customer",
  "every",
  "founders",
  "from",
  "launch",
  "next",
  "post",
  "social",
  "that",
  "their",
  "this",
  "with",
  "workflow",
  "your",
])

function clampConfidence(sampleSize: number): "high" | "medium" | "low" {
  if (sampleSize >= 10) return "high"
  if (sampleSize >= 3) return "medium"
  return "low"
}

function formatPlatform(platform: ContentPlatform | "all"): string {
  if (platform === "instagram") return "Instagram"
  if (platform === "facebook") return "Facebook"
  return "all platforms"
}

function platformMatches(post: HistoricalPostSignal, platform: ContentPlatform | "all"): boolean {
  return platform === "all" || post.platform === platform
}

function selectPosts(signals: ContentIntelligenceSignals, platform: ContentPlatform | "all"): HistoricalPostSignal[] {
  return signals.history.topPosts.filter((post) => platformMatches(post, platform))
}

function selectHours(signals: ContentIntelligenceSignals, platform: ContentPlatform | "all"): HourlyPerformanceSignal[] {
  return signals.history.hourlyPerformance.filter((slot) => platform === "all" || slot.platform === platform)
}

function collectEvidence(cards: Array<{ evidence: IntelligenceEvidence[] }>): IntelligenceEvidence[] {
  const seen = new Set<string>()
  const evidence: IntelligenceEvidence[] = []

  for (const card of cards) {
    for (const item of card.evidence) {
      const key = `${item.sourceType}:${item.title}:${item.summary}:${item.metricBasis?.value || ""}`
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push(item)
    }
  }

  return evidence
}

function humanizeHashtag(tag: string): string {
  const cleaned = tag.replace(/^#/, "")
  const spaced = cleaned
    .replace(/^AI(?=[A-Z])/, "AI ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()

  if (!spaced) return cleaned

  return spaced
    .split(/\s+/)
    .map((word, index) => {
      if (/^ai$/i.test(word)) return "AI"
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      return word.toLowerCase()
    })
    .join(" ")
}

function extractTopic(posts: HistoricalPostSignal[]): string | null {
  const hashtagCounts = new Map<string, number>()
  for (const post of posts) {
    for (const tag of post.hashtags) {
      const label = humanizeHashtag(tag)
      if (label.length >= 3) hashtagCounts.set(label, (hashtagCounts.get(label) || 0) + 1)
    }
  }

  const topHashtagTopic = Array.from(hashtagCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  if (topHashtagTopic) return topHashtagTopic

  const counts = new Map<string, number>()

  for (const post of posts) {
    const words = post.caption
      .replace(/#[a-zA-Z0-9_]+/g, " ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(word))

    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1)
  }

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || null
}

function inferFormat(posts: HistoricalPostSignal[]): string {
  const checklistCount = posts.filter((post) => /(\bsteps?\b|\bchecklist\b|\bhow to\b|\d+\s*-?\s*step)/i.test(post.caption)).length
  const questionCount = posts.filter((post) => post.caption.includes("?")).length

  if (checklistCount >= Math.max(1, questionCount)) return "Checklist or how-to posts"
  if (questionCount > 0) return "Question-led posts"
  return "Clear explanatory posts"
}

function averageCaptionLength(posts: HistoricalPostSignal[]): number {
  if (posts.length === 0) return 0
  return Math.round(posts.reduce((sum, post) => sum + post.caption.length, 0) / posts.length)
}

function makeFallbackResult(platform: ContentPlatform | "all", range: AnalyticsRange): AnalyticsInsightsResult {
  const evidence = [fallbackEvidence(`No reliable ${range.replace(/_/g, " ")} post-performance history is available for ${formatPlatform(platform)} yet.`)]

  return {
    whatIsWorking: [],
    whatToTryNext: [
      {
        id: "publish-test-cadence",
        title: "Run a simple posting-window test",
        description: `Publish three comparable ${formatPlatform(platform)} posts at different times, then compare engagement before trusting automated pattern calls.`,
        confidence: "low",
        evidence,
      },
      {
        id: "tag-consistent-themes",
        title: "Use repeatable topic and hashtag structure",
        description: "Keep a stable set of topic tags for the next few posts so SwiftFlow can detect which themes start outperforming.",
        confidence: "low",
        evidence,
      },
    ],
    patterns: [],
    growthInsights: [
      {
        id: "analytics-baseline-needed",
        kind: "risk",
        title: "Analytics baseline is still forming",
        summary: "Content Intelligence needs synced post metrics before it can separate real account behavior from broad benchmark guidance.",
        confidence: "low",
        evidence,
      },
    ],
    evidence,
    generatedAt: new Date().toISOString(),
    fallbackLevel: "benchmark",
  }
}

export function generateAnalyticsInsights(params: {
  signals: ContentIntelligenceSignals
  platform?: ContentPlatform | "all"
  range?: AnalyticsRange
}): AnalyticsInsightsResult {
  const platform = params.platform || "all"
  const range = params.range || "last_30_days"
  const topPosts = selectPosts(params.signals, platform)
  const sampleSize = topPosts.length

  if (params.signals.history.totalPublishedPosts === 0 || sampleSize === 0) {
    return makeFallbackResult(platform, range)
  }

  const confidence = clampConfidence(params.signals.history.totalPublishedPosts)
  const topPost = topPosts[0]
  const topEvidence = internalEvidence(
    `Top ${formatPlatform(platform)} posts were ranked by likes, comments, shares, saves, and views from synced analytics.`,
    params.signals.history.totalPublishedPosts,
  )

  const whatIsWorking: AnalyticsInsightCard[] = [
    {
      id: "top-post-signal",
      kind: "what_is_working",
      title: `${formatPlatform(topPost.platform)} post format is leading engagement`,
      summary: `The strongest recent post scored ${topPost.score} with ${topPost.likes} likes, ${topPost.comments} comments, and ${topPost.shares} shares.`,
      confidence,
      metricLabel: "Top post score",
      metricValue: String(topPost.score),
      evidence: [topEvidence],
    },
  ]

  const bestHashtag = [...params.signals.history.hashtagPerformance].sort((a, b) => b.averageScore - a.averageScore || b.bestScore - a.bestScore)[0]
  if (bestHashtag) {
    whatIsWorking.push({
      id: "hashtag-signal",
      kind: "what_is_working",
      title: `${bestHashtag.tag} is your strongest repeated tag`,
      summary: `Posts using ${bestHashtag.tag} average a performance score of ${Math.round(bestHashtag.averageScore)} across ${bestHashtag.uses} uses.`,
      confidence: clampConfidence(bestHashtag.uses),
      metricLabel: "Average tag score",
      metricValue: String(Math.round(bestHashtag.averageScore)),
      evidence: [internalEvidence(`Hashtag performance is calculated from repeated tags in synced published posts.`, bestHashtag.uses)],
    })
  }

  const bestHour = selectHours(params.signals, platform).sort((a, b) => b.averageScore - a.averageScore || b.posts - a.posts)[0]
  const topic = extractTopic(topPosts)
  const format = inferFormat(topPosts)
  const captionLength = averageCaptionLength(topPosts)

  const patterns: AnalyticsPatternCard[] = []
  if (topic) {
    patterns.push({
      id: "topic-pattern",
      type: "topic",
      title: "Topic",
      value: topic,
      summary: `This topic appears most often in the current top-performing content sample.`,
      confidence,
      evidence: [topEvidence],
    })
  }
  patterns.push({
    id: "format-pattern",
    type: "format",
    title: "Format",
    value: format,
    summary: "The strongest posts share a repeatable presentation style that is worth testing again.",
    confidence,
    evidence: [topEvidence],
  })
  patterns.push({
    id: "caption-pattern",
    type: "caption",
    title: "Caption",
    value: `${captionLength} chars avg`,
    summary: "Use this as a rough caption-length anchor, then adjust for the post's goal and platform.",
    confidence,
    evidence: [topEvidence],
  })
  if (bestHashtag) {
    patterns.push({
      id: "hashtag-pattern",
      type: "hashtag",
      title: "Hashtag",
      value: bestHashtag.tag,
      summary: `${bestHashtag.tag} currently has the strongest average score among repeated tags.`,
      confidence: clampConfidence(bestHashtag.uses),
      evidence: [internalEvidence("Repeated hashtag performance comes from synced post analytics.", bestHashtag.uses)],
    })
  }
  if (bestHour) {
    patterns.push({
      id: "time-pattern",
      type: "time",
      title: "Time",
      value: `${String(bestHour.hour).padStart(2, "0")}:00 UTC`,
      summary: `${formatPlatform(bestHour.platform)} posts around this hour have the strongest average score in the current sample.`,
      confidence: clampConfidence(bestHour.posts),
      evidence: [internalEvidence("Posting-window performance uses synced post timestamps and engagement metrics.", bestHour.posts)],
    })
  }

  const experimentEvidence = bestHour
    ? internalEvidence("Experiment ideas are derived from the strongest observed post and posting-window patterns.", params.signals.history.totalPublishedPosts)
    : fallbackEvidence("No reliable posting-window pattern is available yet; use a controlled test.", "low")

  const whatToTryNext: AnalyticsExperiment[] = [
    {
      id: "repeat-top-pattern",
      title: "Repeat the strongest pattern with a new angle",
      description: topic
        ? `Create one more ${format.toLowerCase()} around "${topic}" and compare it against the current top post.`
        : `Create one more ${format.toLowerCase()} and compare it against the current top post.`,
      confidence,
      evidence: [experimentEvidence],
    },
    {
      id: "timing-experiment",
      title: "Test the next strong posting window",
      description: bestHour
        ? `Schedule a comparable post near ${String(bestHour.hour).padStart(2, "0")}:00 UTC for ${formatPlatform(bestHour.platform)}.`
        : "Publish comparable posts across morning, midday, and evening windows to build timing confidence.",
      confidence: bestHour ? clampConfidence(bestHour.posts) : "low",
      evidence: [experimentEvidence],
    },
  ]

  const growthInsights: AnalyticsInsightCard[] = [
    {
      id: "growth-evidence-coverage",
      kind: params.signals.capabilities.hasMetaInsights || params.signals.capabilities.hasFacebookEngagement ? "growth" : "risk",
      title: params.signals.capabilities.hasMetaInsights || params.signals.capabilities.hasFacebookEngagement
        ? "Approved analytics signals are feeding recommendations"
        : "Recommendations are limited by available analytics signals",
      summary: params.signals.capabilities.hasMetaInsights || params.signals.capabilities.hasFacebookEngagement
        ? "SwiftFlow is using synced Meta-derived analytics before falling back to broad benchmarks."
        : "Reconnect or expand analytics permissions before treating these recommendations as fully personalized.",
      confidence,
      metricLabel: "Posts analyzed",
      metricValue: String(params.signals.history.totalPublishedPosts),
      evidence: [topEvidence],
    },
  ]

  const evidence = collectEvidence([...whatIsWorking, ...patterns, ...whatToTryNext, ...growthInsights])

  return {
    whatIsWorking,
    whatToTryNext,
    patterns,
    growthInsights,
    evidence,
    generatedAt: new Date().toISOString(),
    fallbackLevel: params.signals.history.totalPublishedPosts >= 3 ? "personalized" : "mixed",
  }
}
