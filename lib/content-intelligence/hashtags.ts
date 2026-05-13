import { fallbackEvidence, internalEvidence } from "./evidence"
import type { ContentIntelligenceSignals, HashtagRecommendation, PostIntelligenceInput } from "./types"

const STOP_WORDS = new Set([
  "with",
  "from",
  "this",
  "that",
  "your",
  "about",
  "better",
  "next",
  "post",
  "social",
  "media",
  "before",
  "after",
  "which",
  "their",
])

function toTag(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9 ]/g, " ").trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ""
  return `#${parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join("")}`
}

function captionKeywords(caption: string): string[] {
  return Array.from(new Set(
    caption
      .toLowerCase()
      .replace(/#[a-z0-9_]+/gi, " ")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 5 && !STOP_WORDS.has(word)),
  )).slice(0, 8)
}

export function recommendHashtags(input: PostIntelligenceInput, signals: ContentIntelligenceSignals): HashtagRecommendation[] {
  const candidates = new Map<string, HashtagRecommendation>()

  const add = (
    tag: string,
    score: number,
    category: HashtagRecommendation["category"],
    reason: string,
    historical = false,
  ) => {
    if (!tag || tag.length < 3) return
    const existing = candidates.get(tag)
    const evidence = historical
      ? [internalEvidence(`"${tag}" has appeared in prior workspace posts.`, signals.history.totalPublishedPosts)]
      : [fallbackEvidence(`"${tag}" was derived from the draft and brand profile.`, "low")]

    if (!existing || score > existing.score) {
      candidates.set(tag, { tag, score, category, reason, evidence })
    }
  }

  for (const row of signals.history.hashtagPerformance) {
    add(row.tag, 80 + Math.min(row.uses, 5), "topic", "This hashtag has prior workspace performance.", true)
  }

  for (const theme of signals.brand?.contentThemes || []) {
    add(toTag(theme), 72, "brand", "Matches a workspace brand content theme.")
  }
  for (const service of signals.brand?.services || []) {
    add(toTag(service), 68, "brand", "Matches a service in the workspace brand profile.")
  }
  for (const audience of signals.brand?.targetAudience ? [signals.brand.targetAudience] : []) {
    add(toTag(audience), 64, "audience", "Matches the audience in the workspace brand profile.")
  }
  for (const keyword of captionKeywords(input.caption)) {
    add(toTag(keyword), 62, "topic", "Matches the current draft topic.")
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, input.platforms.includes("instagram") ? 5 : 8)
}
