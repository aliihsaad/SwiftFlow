import { fallbackEvidence, internalEvidence } from "./evidence"
import type { ContentIntelligenceSignals, PostIntelligenceInput, StrengthBand, StrengthFix, StrengthScore } from "./types"

const IG_CAPTION_LIMIT = 2200
const IG_HASHTAG_LIMIT = 5

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function bandForScore(score: number): StrengthBand {
  if (score >= 85) return "strong"
  if (score >= 70) return "good"
  if (score >= 50) return "needs_work"
  return "weak"
}

function countHashtags(caption: string): number {
  return (caption.match(/#[a-zA-Z0-9_]+/g) || []).length
}

function hasQuestionOrCTA(caption: string): boolean {
  return /(\?|comment|save|share|tell us|try|book|learn|download|follow|get started|read more)/i.test(caption)
}

function brandFitScore(caption: string, signals: ContentIntelligenceSignals): number {
  const brand = signals.brand
  if (!brand) return 50

  const haystack = caption.toLowerCase()
  const matches = [
    ...brand.contentThemes,
    ...brand.services,
    ...brand.uniqueSellingPoints,
    brand.industry || "",
    brand.targetAudience || "",
    brand.businessName || "",
  ]
    .filter(Boolean)
    .filter((term) => haystack.includes(term.toLowerCase())).length

  return clampScore(45 + matches * 12)
}

function platformFitScore(input: PostIntelligenceInput): number {
  let score = 80
  const caption = input.caption.trim()
  const hashtagCount = countHashtags(caption)

  if (input.platforms.includes("instagram") && input.mediaUrls.length === 0) score -= 45
  if (input.platforms.includes("instagram") && caption.length > IG_CAPTION_LIMIT) score -= 35
  if (input.platforms.includes("instagram") && hashtagCount > IG_HASHTAG_LIMIT) score -= 20
  if (caption.length < 30) score -= 20
  if (caption.length > 900) score -= 10

  return clampScore(score)
}

function completenessScore(input: PostIntelligenceInput): number {
  let score = 0
  if (input.caption.trim().length >= 30) score += 35
  if (input.mediaUrls.length > 0) score += 30
  if (hasQuestionOrCTA(input.caption)) score += 20
  if (input.scheduledAt) score += 15
  return clampScore(score)
}

function buildFixes(input: PostIntelligenceInput, subScores: StrengthScore["subScores"]): StrengthFix[] {
  const fixes: StrengthFix[] = []

  if (input.platforms.includes("instagram") && input.mediaUrls.length === 0) {
    fixes.push({
      id: "instagram-media-required",
      title: "Add media for Instagram",
      description: "Instagram publishing needs at least one image or video, and visual posts score higher in this workflow.",
      impact: "high",
    })
  }

  if (input.caption.trim().length < 30) {
    fixes.push({
      id: "caption-too-short",
      title: "Add more context",
      description: "The caption is too short to explain value, audience fit, or a clear action.",
      impact: "high",
    })
  }

  if (!hasQuestionOrCTA(input.caption)) {
    fixes.push({
      id: "missing-cta",
      title: "Add a clear action",
      description: "Ask a question, invite a save/share, or tell the reader what to do next.",
      impact: "medium",
    })
  }

  if (countHashtags(input.caption) > IG_HASHTAG_LIMIT && input.platforms.includes("instagram")) {
    fixes.push({
      id: "too-many-instagram-hashtags",
      title: "Use fewer hashtags",
      description: "Keep Instagram hashtags focused; Phase 1 defaults to five or fewer.",
      impact: "medium",
    })
  }

  if (subScores.brandFit < 55) {
    fixes.push({
      id: "weak-brand-fit",
      title: "Tie it closer to the brand",
      description: "Mention a relevant theme, service, audience problem, or differentiator from the workspace brand profile.",
      impact: "medium",
    })
  }

  return fixes.slice(0, 3)
}

export function scorePostStrength(input: PostIntelligenceInput, signals: ContentIntelligenceSignals): StrengthScore {
  const caption = input.caption.trim()
  const hashtagCount = countHashtags(caption)
  const hasHistory = signals.history.totalPublishedPosts >= 3

  const subScores: StrengthScore["subScores"] = {
    hook: caption.length === 0 ? 0 : clampScore(caption.split(/[.!?\n]/)[0]?.length >= 18 ? 78 : 48),
    brandFit: brandFitScore(caption, signals),
    platformFit: platformFitScore(input),
    hashtags: hashtagCount === 0 ? 45 : hashtagCount <= IG_HASHTAG_LIMIT ? 78 : 50,
    timing: input.scheduledAt ? (hasHistory ? 75 : 60) : 45,
    trend: 50,
    similarity: hasHistory ? 65 : 45,
    completeness: completenessScore(input),
  }

  const weighted =
    subScores.hook * 0.15 +
    subScores.brandFit * 0.15 +
    subScores.platformFit * 0.15 +
    subScores.hashtags * 0.1 +
    subScores.timing * 0.1 +
    subScores.trend * 0.1 +
    subScores.similarity * 0.1 +
    subScores.completeness * 0.15
  const score = clampScore(weighted)
  const evidence = hasHistory
    ? [internalEvidence("Score used workspace publishing history.", signals.history.totalPublishedPosts)]
    : [fallbackEvidence("Limited publishing history; score uses deterministic content checks and benchmark fallback.")]

  return {
    score,
    band: bandForScore(score),
    confidence: hasHistory || signals.capabilities.hasMetaInsights ? "medium" : "low",
    subScores,
    topFixes: buildFixes(input, subScores),
    evidence,
  }
}
