# Content Intelligence Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first production slice of SwiftFlow Content Intelligence to the post creator: explainable post strength, top fixes, evidence-backed hashtags, best-time suggestions, and a mobile-friendly intelligence panel.

**Architecture:** Build a provider-neutral `lib/content-intelligence` domain with pure scoring/signal logic, then expose it through authenticated Next API routes. The create modal consumes the API through a compact responsive panel; the existing caption/image generation flows remain intact.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, existing workspace AI settings, existing Meta analytics tables, lucide-react, existing shadcn/Radix UI primitives, Vitest for pure-module tests.

---

## Design Source

Spec: `docs/superpowers/specs/2026-05-13-content-intelligence-design.md`

Phase 1 scope from the spec:

- Post strength score.
- Explainable top fixes.
- Evidence-backed hashtag recommendations.
- Best-time recommendations using internal/Meta-derived data first and benchmark/research fallback.
- Provider-neutral research adapter with OpenRouter recommended, Gemini fallback, and OpenAI-ready interface.
- Mobile-safe intelligence panel.

Defer:

- Calendar heatmap.
- Analytics intelligence page.
- External paid trend providers.
- Audience comment/message mining.
- Auto-scheduling or auto-publishing.

---

## File Structure

Create:

- `lib/content-intelligence/types.ts`  
  Shared request/response types for post analysis, scoring, evidence, hashtags, and slots.

- `lib/content-intelligence/evidence.ts`  
  Small helpers for evidence confidence and fallback labeling.

- `lib/content-intelligence/internal-signals.ts`  
  Normalizes `posts`, `published_posts`, `post_analytics`, `account_analytics`, `social_accounts`, and `workspace_brand_profiles` into reusable signals.

- `lib/content-intelligence/scoring.ts`  
  Deterministic post strength scoring and top-fix generation.

- `lib/content-intelligence/hashtags.ts`  
  Hashtag extraction, filtering, ranking, and explanation.

- `lib/content-intelligence/timing.ts`  
  Best-time slot ranking from internal analytics and fallback windows.

- `lib/content-intelligence/research.ts`  
  Provider-neutral research interface and safe fallback implementation. Phase 1 may return cached/disabled research when no provider is configured; do not block local scoring.

- `app/api/content-intelligence/analyze-post/route.ts`  
  Authenticated API that gathers workspace data, builds signals, runs scoring/hashtags/timing, and returns one `PostIntelligenceResult`.

- `app/api/content-intelligence/recommend-slots/route.ts`  
  Replacement API for scheduling controls; returns ranked slots using the same timing module.

- `components/create/content-intelligence-panel.tsx`  
  Responsive UI panel for score, top fixes, hashtags, recommended times, and evidence.

- `components/create/content-intelligence-summary.tsx`  
  Small mobile-first score row used near the composer.

- `tests/content-intelligence/scoring.test.ts`  
  Pure tests for score bands, fallback behavior, and top fixes.

- `tests/content-intelligence/hashtags.test.ts`  
  Pure tests for hashtag extraction/filtering/ranking.

- `tests/content-intelligence/timing.test.ts`  
  Pure tests for slot ranking and low-confidence fallback.

- `vitest.config.ts`  
  Test config for pure TypeScript modules.

Modify:

- `package.json`  
  Add `test:ci` script and Vitest dev dependency.

- `components/create/create-post-modal.tsx`  
  Add intelligence state, analysis calls, panel placement, mobile-safe layout, and apply handlers.

- `components/create/scheduling-controls.tsx`  
  Replace `/api/recommend-next-slot` call with `/api/content-intelligence/recommend-slots`; accept optional `workspaceId`, `caption`, `platforms`, and `onSlotEvidence`.

- `types/post.ts`  
  Add optional intelligence-related platform/request types only if importing from `lib/content-intelligence/types.ts` would create a client/server boundary issue.

- `app/api/recommend-next-slot/route.ts`  
  Keep as compatibility wrapper that delegates to the new route or returns the first slot. Do not delete in Phase 1.

---

## Task 1: Add Test Harness For Pure Modules

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Add failing test command expectation**

Run:

```powershell
pnpm run test:ci
```

Expected before implementation:

```text
ERR_PNPM_NO_SCRIPT Missing script: test:ci
```

- [ ] **Step 2: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": new URL("./", import.meta.url).pathname,
    },
  },
})
```

- [ ] **Step 3: Update package scripts and dev dependency**

In `package.json`, add:

```json
"test:ci": "vitest run"
```

Add dev dependency:

```json
"vitest": "^4.0.0"
```

Keep existing scripts unchanged.

- [ ] **Step 4: Install dependency if lockfile requires it**

Run:

```powershell
pnpm install
```

Expected:

```text
Done
```

If network is unavailable, stop this task and ask for approval to fetch dependencies. Do not hand-edit `pnpm-lock.yaml`.

- [ ] **Step 5: Verify test harness exists**

Run:

```powershell
pnpm run test:ci
```

Expected until tests are added:

```text
No test files found
```

- [ ] **Step 6: Commit**

```powershell
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "test: add content intelligence test harness"
```

---

## Task 2: Define Content Intelligence Types

**Files:**

- Create: `lib/content-intelligence/types.ts`
- Create: `tests/content-intelligence/scoring.test.ts`

- [ ] **Step 1: Write failing type-level test via scoring test import**

Create `tests/content-intelligence/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { scorePostStrength } from "@/lib/content-intelligence/scoring"
import type { PostIntelligenceInput, ContentIntelligenceSignals } from "@/lib/content-intelligence/types"

describe("scorePostStrength", () => {
  it("returns a weak score and actionable fixes for an empty Instagram post", () => {
    const input: PostIntelligenceInput = {
      workspaceId: "workspace-1",
      caption: "",
      platforms: ["instagram"],
      mediaUrls: [],
      scheduledAt: null,
    }
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
        hasFacebookEngagement: false,
      },
    }

    const result = scorePostStrength(input, signals)

    expect(result.score).toBeLessThan(50)
    expect(result.band).toBe("weak")
    expect(result.topFixes.map((fix) => fix.id)).toContain("instagram-media-required")
  })
})
```

Run:

```powershell
pnpm run test:ci
```

Expected failure:

```text
Cannot find module '@/lib/content-intelligence/scoring'
```

- [ ] **Step 2: Create shared types**

Create `lib/content-intelligence/types.ts`:

```ts
export type ContentPlatform = "instagram" | "facebook"
export type IntelligenceConfidence = "high" | "medium" | "low"
export type EvidenceFreshness = "live" | "last_24h" | "last_7d" | "last_30d" | "historical" | "unknown"

export type EvidenceSourceType =
  | "meta_insights"
  | "internal_analytics"
  | "brand_profile"
  | "grounded_web"
  | "trend_provider"
  | "benchmark"
  | "ai_inference"
  | "fallback"

export interface IntelligenceEvidence {
  sourceType: EvidenceSourceType
  provider?: "openrouter" | "gemini" | "openai" | "meta" | "internal" | "benchmark"
  title: string
  url?: string
  observedAt: string
  freshness: EvidenceFreshness
  confidence: IntelligenceConfidence
  summary: string
  metricBasis?: {
    metric: string
    value: number | string
    sampleSize?: number
  }
}

export interface PostIntelligenceInput {
  workspaceId: string
  caption: string
  platforms: ContentPlatform[]
  mediaUrls: string[]
  scheduledAt: string | null
}

export interface BrandSignal {
  businessName: string | null
  industry: string | null
  targetAudience: string | null
  brandVoice: string | null
  language: string | null
  contentThemes: string[]
  services: string[]
  uniqueSellingPoints: string[]
}

export interface HistoricalPostSignal {
  id: string
  platform: ContentPlatform
  caption: string
  publishedAt: string | null
  likes: number
  comments: number
  shares: number
  views: number
  saves: number
  score: number
  hashtags: string[]
}

export interface HashtagPerformanceSignal {
  tag: string
  uses: number
  averageScore: number
  bestScore: number
}

export interface HourlyPerformanceSignal {
  platform: ContentPlatform
  dayOfWeek: number
  hour: number
  posts: number
  averageScore: number
}

export interface ContentIntelligenceSignals {
  brand: BrandSignal | null
  history: {
    totalPublishedPosts: number
    topPosts: HistoricalPostSignal[]
    hashtagPerformance: HashtagPerformanceSignal[]
    hourlyPerformance: HourlyPerformanceSignal[]
  }
  capabilities: {
    hasMetaInsights: boolean
    hasFacebookEngagement: boolean
  }
}

export type StrengthBand = "strong" | "good" | "needs_work" | "weak"

export interface StrengthFix {
  id: string
  title: string
  description: string
  impact: "high" | "medium" | "low"
}

export interface StrengthScore {
  score: number
  band: StrengthBand
  confidence: IntelligenceConfidence
  subScores: {
    hook: number
    brandFit: number
    platformFit: number
    hashtags: number
    timing: number
    trend: number
    similarity: number
    completeness: number
  }
  topFixes: StrengthFix[]
  evidence: IntelligenceEvidence[]
}

export interface HashtagRecommendation {
  tag: string
  score: number
  reason: string
  category: "niche" | "audience" | "topic" | "brand" | "trend"
  evidence: IntelligenceEvidence[]
}

export interface RecommendedSlot {
  startsAt: string
  platform: ContentPlatform | "all"
  score: number
  confidence: IntelligenceConfidence
  reason: string
  evidence: IntelligenceEvidence[]
}

export interface PostIntelligenceResult {
  strength: StrengthScore
  hashtags: HashtagRecommendation[]
  slots: RecommendedSlot[]
  evidence: IntelligenceEvidence[]
  generatedAt: string
  fallbackLevel: "personalized" | "mixed" | "benchmark"
}
```

- [ ] **Step 3: Run test and verify next expected failure**

Run:

```powershell
pnpm run test:ci
```

Expected:

```text
Cannot find module '@/lib/content-intelligence/scoring'
```

- [ ] **Step 4: Commit**

```powershell
git add lib/content-intelligence/types.ts tests/content-intelligence/scoring.test.ts
git commit -m "feat: define content intelligence types"
```

---

## Task 3: Implement Deterministic Post Strength Scoring

**Files:**

- Create: `lib/content-intelligence/evidence.ts`
- Create: `lib/content-intelligence/scoring.ts`
- Modify: `tests/content-intelligence/scoring.test.ts`

- [ ] **Step 1: Expand failing scoring tests**

Append to `tests/content-intelligence/scoring.test.ts`:

```ts
it("rewards a complete on-brand post with media and clear hook", () => {
  const input: PostIntelligenceInput = {
    workspaceId: "workspace-1",
    caption: "Save this 5-step checklist before planning your next campaign. Which step do you skip most often? #ContentStrategy #SmallBusiness",
    platforms: ["instagram"],
    mediaUrls: ["https://example.com/post.jpg"],
    scheduledAt: new Date("2026-05-14T09:00:00.000Z").toISOString(),
  }
  const signals: ContentIntelligenceSignals = {
    brand: {
      businessName: "SwiftFlow",
      industry: "social media software",
      targetAudience: "small businesses",
      brandVoice: "professional",
      language: "en",
      contentThemes: ["content strategy", "automation"],
      services: ["social scheduling"],
      uniqueSellingPoints: ["AI assisted planning"],
    },
    history: {
      totalPublishedPosts: 8,
      topPosts: [],
      hashtagPerformance: [{ tag: "#ContentStrategy", uses: 2, averageScore: 18, bestScore: 32 }],
      hourlyPerformance: [{ platform: "instagram", dayOfWeek: 4, hour: 9, posts: 3, averageScore: 25 }],
    },
    capabilities: {
      hasMetaInsights: true,
      hasFacebookEngagement: false,
    },
  }

  const result = scorePostStrength(input, signals)

  expect(result.score).toBeGreaterThanOrEqual(70)
  expect(["good", "strong"]).toContain(result.band)
  expect(result.topFixes.length).toBeLessThanOrEqual(3)
})
```

Run:

```powershell
pnpm run test:ci
```

Expected failure:

```text
Cannot find module '@/lib/content-intelligence/scoring'
```

- [ ] **Step 2: Create evidence helper**

Create `lib/content-intelligence/evidence.ts`:

```ts
import type { IntelligenceEvidence } from "./types"

export function fallbackEvidence(summary: string, confidence: "high" | "medium" | "low" = "low"): IntelligenceEvidence {
  return {
    sourceType: "fallback",
    provider: "benchmark",
    title: "Benchmark fallback",
    observedAt: new Date().toISOString(),
    freshness: "unknown",
    confidence,
    summary,
  }
}

export function internalEvidence(summary: string, sampleSize?: number): IntelligenceEvidence {
  return {
    sourceType: "internal_analytics",
    provider: "internal",
    title: "Workspace analytics",
    observedAt: new Date().toISOString(),
    freshness: "historical",
    confidence: sampleSize && sampleSize >= 10 ? "high" : sampleSize && sampleSize >= 3 ? "medium" : "low",
    summary,
    metricBasis: sampleSize ? { metric: "sample_size", value: sampleSize, sampleSize } : undefined,
  }
}
```

- [ ] **Step 3: Implement scoring**

Create `lib/content-intelligence/scoring.ts`:

```ts
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
  return /(\?|comment|save|share|tell us|try|book|learn|download|follow)/i.test(caption)
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
  ].filter(Boolean).filter((term) => haystack.includes(term.toLowerCase())).length
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
```

- [ ] **Step 4: Run tests**

```powershell
pnpm run test:ci
```

Expected:

```text
2 passed
```

- [ ] **Step 5: Commit**

```powershell
git add lib/content-intelligence/evidence.ts lib/content-intelligence/scoring.ts tests/content-intelligence/scoring.test.ts
git commit -m "feat: add post strength scoring"
```

---

## Task 4: Add Hashtag Recommendation Logic

**Files:**

- Create: `lib/content-intelligence/hashtags.ts`
- Create: `tests/content-intelligence/hashtags.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/content-intelligence/hashtags.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { recommendHashtags } from "@/lib/content-intelligence/hashtags"
import type { ContentIntelligenceSignals, PostIntelligenceInput } from "@/lib/content-intelligence/types"

const signals: ContentIntelligenceSignals = {
  brand: {
    businessName: "SwiftFlow",
    industry: "social media software",
    targetAudience: "small business owners",
    brandVoice: "professional",
    language: "en",
    contentThemes: ["content strategy", "automation"],
    services: ["social scheduling"],
    uniqueSellingPoints: ["AI assisted planning"],
  },
  history: {
    totalPublishedPosts: 4,
    topPosts: [],
    hashtagPerformance: [{ tag: "#ContentStrategy", uses: 3, averageScore: 20, bestScore: 35 }],
    hourlyPerformance: [],
  },
  capabilities: { hasMetaInsights: true, hasFacebookEngagement: false },
}

describe("recommendHashtags", () => {
  it("returns five or fewer focused Instagram hashtags with reasons", () => {
    const input: PostIntelligenceInput = {
      workspaceId: "workspace-1",
      caption: "Planning better campaigns with automation and content strategy for small businesses.",
      platforms: ["instagram"],
      mediaUrls: ["https://example.com/post.jpg"],
      scheduledAt: null,
    }

    const tags = recommendHashtags(input, signals)

    expect(tags.length).toBeLessThanOrEqual(5)
    expect(tags.map((tag) => tag.tag)).toContain("#ContentStrategy")
    expect(tags.every((tag) => tag.reason.length > 0)).toBe(true)
  })
})
```

Run:

```powershell
pnpm run test:ci
```

Expected failure:

```text
Cannot find module '@/lib/content-intelligence/hashtags'
```

- [ ] **Step 2: Implement hashtag logic**

Create `lib/content-intelligence/hashtags.ts`:

```ts
import { fallbackEvidence, internalEvidence } from "./evidence"
import type { ContentIntelligenceSignals, HashtagRecommendation, PostIntelligenceInput } from "./types"

const STOP_WORDS = new Set(["with", "from", "this", "that", "your", "about", "better", "next", "post", "social", "media"])

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
      .filter((word) => word.length >= 5 && !STOP_WORDS.has(word))
  )).slice(0, 8)
}

export function recommendHashtags(input: PostIntelligenceInput, signals: ContentIntelligenceSignals): HashtagRecommendation[] {
  const candidates = new Map<string, HashtagRecommendation>()
  const add = (tag: string, score: number, category: HashtagRecommendation["category"], reason: string, historical = false) => {
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
  for (const keyword of captionKeywords(input.caption)) {
    add(toTag(keyword), 62, "topic", "Matches the current draft topic.")
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag))
    .slice(0, input.platforms.includes("instagram") ? 5 : 8)
}
```

- [ ] **Step 3: Run tests**

```powershell
pnpm run test:ci
```

Expected:

```text
3 passed
```

- [ ] **Step 4: Commit**

```powershell
git add lib/content-intelligence/hashtags.ts tests/content-intelligence/hashtags.test.ts
git commit -m "feat: add hashtag recommendations"
```

---

## Task 5: Add Timing Recommendation Logic

**Files:**

- Create: `lib/content-intelligence/timing.ts`
- Create: `tests/content-intelligence/timing.test.ts`

- [ ] **Step 1: Write failing timing tests**

Create `tests/content-intelligence/timing.test.ts`:

```ts
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
```

- [ ] **Step 2: Implement timing module**

Create `lib/content-intelligence/timing.ts`:

```ts
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
```

- [ ] **Step 3: Run tests**

```powershell
pnpm run test:ci
```

Expected:

```text
5 passed
```

- [ ] **Step 4: Commit**

```powershell
git add lib/content-intelligence/timing.ts tests/content-intelligence/timing.test.ts
git commit -m "feat: add posting time recommendations"
```

---

## Task 6: Build Internal Signal Loader

**Files:**

- Create: `lib/content-intelligence/internal-signals.ts`
- Modify: `app/api/content-intelligence/analyze-post/route.ts` later consumes this file.

- [ ] **Step 1: Create internal signal normalizer**

Create `lib/content-intelligence/internal-signals.ts`:

```ts
import type { BrandSignal, ContentIntelligenceSignals, ContentPlatform, HashtagPerformanceSignal, HistoricalPostSignal, HourlyPerformanceSignal } from "./types"

type AnyRow = Record<string, any>

function extractHashtags(caption: string): string[] {
  return Array.from(new Set((caption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.trim())))
}

function postScore(row: AnyRow): number {
  return Number(row.likes || 0) + Number(row.comments || 0) * 2 + Number(row.shares || 0) * 3 + Number(row.saves || 0) * 3 + Math.round(Number(row.views || 0) / 100)
}

function normalizeBrand(row: AnyRow | null): BrandSignal | null {
  if (!row) return null
  return {
    businessName: row.business_name || null,
    industry: row.industry || null,
    targetAudience: row.target_audience || null,
    brandVoice: row.brand_voice || null,
    language: row.language || null,
    contentThemes: Array.isArray(row.content_themes) ? row.content_themes.filter(Boolean) : [],
    services: Array.isArray(row.services) ? row.services.map((s: AnyRow) => s?.name).filter(Boolean) : [],
    uniqueSellingPoints: Array.isArray(row.unique_selling_points) ? row.unique_selling_points.filter(Boolean) : [],
  }
}

export function buildContentIntelligenceSignals(params: {
  brandProfile: AnyRow | null
  publishedPosts: AnyRow[]
  postAnalytics: AnyRow[]
  socialAccounts: AnyRow[]
}): ContentIntelligenceSignals {
  const analyticsByPublishedPost = new Map<string, AnyRow>()
  for (const row of params.postAnalytics || []) {
    if (row?.published_post_id) analyticsByPublishedPost.set(row.published_post_id, row)
  }

  const historicalPosts: HistoricalPostSignal[] = (params.publishedPosts || [])
    .map((row) => {
      const analytics = analyticsByPublishedPost.get(row.id) || {}
      const caption = String(row.platform_caption || row.caption || "")
      const score = postScore(analytics)
      return {
        id: String(row.id),
        platform: (row.platform === "facebook" ? "facebook" : "instagram") as ContentPlatform,
        caption,
        publishedAt: row.published_at || null,
        likes: Number(analytics.likes || 0),
        comments: Number(analytics.comments || 0),
        shares: Number(analytics.shares || 0),
        views: Number(analytics.views || 0),
        saves: Number(analytics.saves || 0),
        score,
        hashtags: extractHashtags(caption),
      }
    })
    .sort((a, b) => b.score - a.score)

  const hashtagMap = new Map<string, { uses: number; total: number; best: number }>()
  for (const post of historicalPosts) {
    for (const tag of post.hashtags) {
      const existing = hashtagMap.get(tag) || { uses: 0, total: 0, best: 0 }
      existing.uses += 1
      existing.total += post.score
      existing.best = Math.max(existing.best, post.score)
      hashtagMap.set(tag, existing)
    }
  }
  const hashtagPerformance: HashtagPerformanceSignal[] = Array.from(hashtagMap.entries()).map(([tag, stats]) => ({
    tag,
    uses: stats.uses,
    averageScore: stats.uses > 0 ? stats.total / stats.uses : 0,
    bestScore: stats.best,
  }))

  const hourlyMap = new Map<string, { platform: ContentPlatform; dayOfWeek: number; hour: number; posts: number; total: number }>()
  for (const post of historicalPosts) {
    if (!post.publishedAt) continue
    const publishedAt = new Date(post.publishedAt)
    if (!Number.isFinite(publishedAt.getTime())) continue
    const key = `${post.platform}:${publishedAt.getUTCDay()}:${publishedAt.getUTCHours()}`
    const existing = hourlyMap.get(key) || {
      platform: post.platform,
      dayOfWeek: publishedAt.getUTCDay(),
      hour: publishedAt.getUTCHours(),
      posts: 0,
      total: 0,
    }
    existing.posts += 1
    existing.total += post.score
    hourlyMap.set(key, existing)
  }
  const hourlyPerformance: HourlyPerformanceSignal[] = Array.from(hourlyMap.values()).map((row) => ({
    platform: row.platform,
    dayOfWeek: row.dayOfWeek,
    hour: row.hour,
    posts: row.posts,
    averageScore: row.posts > 0 ? row.total / row.posts : 0,
  }))

  const grantedScopes = new Set<string>()
  for (const account of params.socialAccounts || []) {
    const scopes = Array.isArray(account?.metadata?.granted_scopes) ? account.metadata.granted_scopes : []
    for (const scope of scopes) grantedScopes.add(String(scope))
  }

  return {
    brand: normalizeBrand(params.brandProfile),
    history: {
      totalPublishedPosts: historicalPosts.length,
      topPosts: historicalPosts.slice(0, 10),
      hashtagPerformance,
      hourlyPerformance,
    },
    capabilities: {
      hasMetaInsights: grantedScopes.has("instagram_manage_insights"),
      hasFacebookEngagement: grantedScopes.has("pages_read_engagement"),
    },
  }
}
```

- [ ] **Step 2: Run lint/build after adding module**

```powershell
pnpm run lint
pnpm run build
```

Expected:

```text
No ESLint errors
Compiled successfully
```

- [ ] **Step 3: Commit**

```powershell
git add lib/content-intelligence/internal-signals.ts
git commit -m "feat: build content intelligence signals"
```

---

## Task 7: Implement Analyze Post API

**Files:**

- Create: `app/api/content-intelligence/analyze-post/route.ts`

- [ ] **Step 1: Create route**

Create `app/api/content-intelligence/analyze-post/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { buildContentIntelligenceSignals } from "@/lib/content-intelligence/internal-signals"
import { scorePostStrength } from "@/lib/content-intelligence/scoring"
import { recommendHashtags } from "@/lib/content-intelligence/hashtags"
import { recommendSlots } from "@/lib/content-intelligence/timing"
import type { ContentPlatform, PostIntelligenceInput, PostIntelligenceResult } from "@/lib/content-intelligence/types"

export const runtime = "edge"

function normalizePlatforms(value: unknown): ContentPlatform[] {
  const raw = Array.isArray(value) ? value : []
  const platforms = raw.filter((item): item is ContentPlatform => item === "instagram" || item === "facebook")
  return platforms.length > 0 ? platforms : ["instagram"]
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const input: PostIntelligenceInput = {
      workspaceId: activeWorkspace.id,
      caption: String(body?.caption || "").slice(0, 5000),
      platforms: normalizePlatforms(body?.platforms),
      mediaUrls: Array.isArray(body?.mediaUrls) ? body.mediaUrls.filter((url: unknown) => typeof url === "string").slice(0, 10) : [],
      scheduledAt: typeof body?.scheduledAt === "string" ? body.scheduledAt : null,
    }

    const admin = createAdminClient()

    const [{ data: brandProfile }, { data: socialAccounts }, { data: posts }] = await Promise.all([
      admin.from("workspace_brand_profiles").select("*").eq("workspace_id", activeWorkspace.id).maybeSingle(),
      admin.from("social_accounts").select("id, platform, metadata").eq("workspace_id", activeWorkspace.id),
      admin.from("posts").select("id").eq("workspace_id", activeWorkspace.id).order("created_at", { ascending: false }).limit(100),
    ])

    const postIds = (posts || []).map((post) => post.id)
    let publishedPosts: any[] = []
    if (postIds.length > 0) {
      const { data } = await admin.from("published_posts").select("*").in("post_id", postIds)
      publishedPosts = data || []
    }

    const accountIds = (socialAccounts || []).map((account) => account.id)
    if (accountIds.length > 0) {
      const { data } = await admin.from("published_posts").select("*").in("social_account_id", accountIds).limit(100)
      const map = new Map<string, any>()
      for (const row of [...publishedPosts, ...(data || [])]) map.set(row.id, row)
      publishedPosts = Array.from(map.values())
    }

    const publishedPostIds = publishedPosts.map((post) => post.id)
    let postAnalytics: any[] = []
    if (publishedPostIds.length > 0) {
      const { data } = await admin.from("post_analytics").select("*").in("published_post_id", publishedPostIds)
      postAnalytics = data || []
    }

    const signals = buildContentIntelligenceSignals({
      brandProfile: brandProfile || null,
      publishedPosts,
      postAnalytics,
      socialAccounts: socialAccounts || [],
    })

    const strength = scorePostStrength(input, signals)
    const hashtags = recommendHashtags(input, signals)
    const slots = recommendSlots({ platform: input.platforms.length === 1 ? input.platforms[0] : "all", now: new Date(), signals })
    const evidence = [...strength.evidence, ...hashtags.flatMap((tag) => tag.evidence), ...slots.flatMap((slot) => slot.evidence)]
    const result: PostIntelligenceResult = {
      strength,
      hashtags,
      slots,
      evidence,
      generatedAt: new Date().toISOString(),
      fallbackLevel: signals.history.totalPublishedPosts >= 3 ? "personalized" : signals.history.totalPublishedPosts > 0 ? "mixed" : "benchmark",
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("[content-intelligence/analyze-post]", error)
    return NextResponse.json({ error: "Failed to analyze post" }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify unauthenticated route behavior manually**

Run the app and call the route without auth from a browser/private context.

Expected:

```json
{"error":"Unauthorized"}
```

- [ ] **Step 3: Run verification**

```powershell
pnpm run lint
pnpm run build
```

Expected:

```text
No ESLint errors
Compiled successfully
```

- [ ] **Step 4: Commit**

```powershell
git add app/api/content-intelligence/analyze-post/route.ts
git commit -m "feat: add post intelligence API"
```

---

## Task 8: Implement Recommended Slots API And Compatibility Wrapper

**Files:**

- Create: `app/api/content-intelligence/recommend-slots/route.ts`
- Modify: `app/api/recommend-next-slot/route.ts`

- [ ] **Step 1: Create recommended slots API**

Create `app/api/content-intelligence/recommend-slots/route.ts` using the same auth/data loading pattern as `analyze-post`, but only return:

```ts
{
  slots: RecommendedSlot[]
}
```

The route should:

- Read optional `platform` query param.
- Resolve active workspace.
- Load brand/social/posts/published_posts/post_analytics.
- Build signals.
- Call `recommendSlots`.
- Return three slots.

- [ ] **Step 2: Convert old route to compatibility wrapper**

Modify `app/api/recommend-next-slot/route.ts`:

```ts
import { NextResponse } from "next/server"
import { recommendSlots } from "@/lib/content-intelligence/timing"

export async function GET() {
  const [nextSlot] = recommendSlots({
    platform: "all",
    now: new Date(),
    signals: {
      brand: null,
      history: {
        totalPublishedPosts: 0,
        topPosts: [],
        hashtagPerformance: [],
        hourlyPerformance: [],
      },
      capabilities: {
        hasMetaInsights: false,
        hasFacebookEngagement: false,
      },
    },
  })

  return NextResponse.json({ nextSlot: nextSlot?.startsAt || new Date().toISOString() })
}
```

- [ ] **Step 3: Run verification**

```powershell
pnpm run test:ci
pnpm run lint
pnpm run build
```

Expected:

```text
Tests pass
No ESLint errors
Compiled successfully
```

- [ ] **Step 4: Commit**

```powershell
git add app/api/content-intelligence/recommend-slots/route.ts app/api/recommend-next-slot/route.ts
git commit -m "feat: add content intelligence slot recommendations"
```

---

## Task 9: Add Mobile-First Intelligence UI Components

**Files:**

- Create: `components/create/content-intelligence-summary.tsx`
- Create: `components/create/content-intelligence-panel.tsx`

- [ ] **Step 1: Create compact summary row**

Create `components/create/content-intelligence-summary.tsx`:

```tsx
"use client"

import { BarChart3, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PostIntelligenceResult } from "@/lib/content-intelligence/types"

export function ContentIntelligenceSummary({
  result,
  loading,
  onAnalyze,
}: {
  result: PostIntelligenceResult | null
  loading: boolean
  onAnalyze: () => void
}) {
  const score = result?.strength.score
  const band = result?.strength.band || "weak"
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
        score && score >= 70 ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200" : "border-amber-300/25 bg-amber-400/10 text-amber-200"
      )}>
        <BarChart3 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white/85">
          {score == null ? "Post Strength" : `Post Strength ${score}/100`}
        </p>
        <p className="truncate text-[11px] text-white/45">
          {result?.strength.topFixes[0]?.title || "Analyze for score, hashtags, and best time"}
        </p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={onAnalyze} disabled={loading} className="h-8 shrink-0 gap-1.5 text-xs">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        <span className="hidden min-[380px]:inline">{loading ? "Checking" : band === "weak" ? "Analyze" : "Refresh"}</span>
      </Button>
    </div>
  )
}
```

Mobile requirement:

- The row must fit at 320px width.
- The button text hides below 380px.
- Long fix text truncates instead of wrapping over controls.

- [ ] **Step 2: Create full panel**

Create `components/create/content-intelligence-panel.tsx` with:

- `PostIntelligenceResult | null`.
- `loading`.
- `onApplyHashtag(tag: string)`.
- `onApplySlot(iso: string)`.
- `onAnalyze()`.
- Responsive root: `grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]` is not used here; the parent controls placement.
- Internal sections use `space-y-2`, `flex-wrap`, `min-w-0`, and no fixed width wider than the modal.

Required UI sections:

- Score bar using a simple div progress track.
- Top fixes list, max 3.
- Hashtag chips with apply buttons.
- Best time buttons.
- Evidence details using `<details>` so mobile stays compact.

- [ ] **Step 3: Run visual sanity through build**

```powershell
pnpm run lint
pnpm run build
```

Expected:

```text
No ESLint errors
Compiled successfully
```

- [ ] **Step 4: Commit**

```powershell
git add components/create/content-intelligence-summary.tsx components/create/content-intelligence-panel.tsx
git commit -m "feat: add content intelligence UI components"
```

---

## Task 10: Wire Intelligence Into Create Post Modal

**Files:**

- Modify: `components/create/create-post-modal.tsx`
- Modify: `components/create/scheduling-controls.tsx`

- [ ] **Step 1: Add modal state and API call**

In `components/create/create-post-modal.tsx`, import:

```tsx
import { ContentIntelligencePanel } from "./content-intelligence-panel"
import { ContentIntelligenceSummary } from "./content-intelligence-summary"
import type { PostIntelligenceResult } from "@/lib/content-intelligence/types"
```

Add state:

```tsx
const [intelligence, setIntelligence] = useState<PostIntelligenceResult | null>(null)
const [isAnalyzingIntelligence, setIsAnalyzingIntelligence] = useState(false)
```

Add handler:

```tsx
const handleAnalyzeIntelligence = async () => {
  setIsAnalyzingIntelligence(true)
  setInlineError(null)
  try {
    const platforms = activeTab === "all" ? ["instagram", "facebook"] : [activeTab]
    const res = await fetch("/api/content-intelligence/analyze-post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        caption: globalCaption,
        platforms,
        mediaUrls: globalMedia,
        scheduledAt: scheduledAt?.toISOString() || null,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || "Failed to analyze post")
    setIntelligence(data)
  } catch (error) {
    setInlineError(error instanceof Error ? error.message : "Failed to analyze post.")
  } finally {
    setIsAnalyzingIntelligence(false)
  }
}
```

Add apply handlers:

```tsx
const handleApplyHashtag = (tag: string) => {
  setGlobalCaption((value) => value.includes(tag) ? value : `${value.trim()} ${tag}`.trim())
}

const handleApplySlot = (iso: string) => {
  const date = new Date(iso)
  if (Number.isFinite(date.getTime())) setScheduledAt(date)
}
```

- [ ] **Step 2: Place summary and panel mobile-first**

Inside the scrollable body, after the caption editor and before hashtags/media upload:

```tsx
<ContentIntelligenceSummary
  result={intelligence}
  loading={isAnalyzingIntelligence}
  onAnalyze={handleAnalyzeIntelligence}
/>

<ContentIntelligencePanel
  result={intelligence}
  loading={isAnalyzingIntelligence}
  onAnalyze={handleAnalyzeIntelligence}
  onApplyHashtag={handleApplyHashtag}
  onApplySlot={handleApplySlot}
/>
```

Do not put the panel in the fixed footer. The footer must remain focused on scheduling and post actions.

- [ ] **Step 3: Update scheduling controls props**

In `components/create/scheduling-controls.tsx`, extend props:

```tsx
interface SchedulingControlsProps {
  scheduledAt: Date | undefined
  onChange: (date: Date) => void
  caption?: string
  platforms?: string[]
}
```

Change `handleNextSlot` to call:

```tsx
const params = new URLSearchParams()
if (platforms?.length === 1) params.set("platform", platforms[0])
const res = await fetch(`/api/content-intelligence/recommend-slots?${params.toString()}`)
const data = await res.json()
if (data.slots?.[0]?.startsAt) onChange(new Date(data.slots[0].startsAt))
```

Pass from modal:

```tsx
<SchedulingControls
  scheduledAt={scheduledAt}
  onChange={setScheduledAt}
  caption={globalCaption}
  platforms={activeTab === "all" ? ["instagram", "facebook"] : [activeTab]}
/>
```

- [ ] **Step 4: Mobile verification**

Start dev server:

```powershell
pnpm run dev
```

Open the app on:

- desktop viewport around 1280px wide
- mobile viewport around 390px wide
- narrow mobile viewport around 320px wide

Verify:

- No horizontal scrolling in the modal.
- Summary row fits at 320px.
- Panel sections collapse naturally and do not push footer buttons off-screen.
- Footer action buttons remain reachable.
- Hashtag chips wrap.
- Evidence details do not overflow.

- [ ] **Step 5: Run verification**

```powershell
pnpm run test:ci
pnpm run lint
pnpm run build
```

Expected:

```text
Tests pass
No ESLint errors
Compiled successfully
```

- [ ] **Step 6: Commit**

```powershell
git add components/create/create-post-modal.tsx components/create/scheduling-controls.tsx
git commit -m "feat: wire content intelligence into post creator"
```

---

## Task 11: Final Verification And Push

**Files:**

- All files from prior tasks.

- [ ] **Step 1: Full status check**

```powershell
git status --short
```

Expected:

```text
Only unrelated pre-existing dirty files should remain.
```

- [ ] **Step 2: Run full verification**

```powershell
pnpm run test:ci
pnpm run lint
pnpm run build
```

Expected:

```text
Tests pass
No ESLint errors
Compiled successfully
```

- [ ] **Step 3: Manual mobile acceptance**

Verify the create post modal manually at 320px, 390px, and desktop:

- Score summary visible without overlap.
- Analyze button reachable.
- Panel does not create horizontal scroll.
- Hashtag and slot apply buttons work.
- Footer remains sticky/reachable.
- Preview modal still opens correctly.

- [ ] **Step 4: Push**

```powershell
git push
```

Expected:

```text
master pushed to origin
```

---

## Review Checklist

Before marking Phase 1 complete:

- [ ] The feature works with no AI provider configured by still returning deterministic local scoring and fallback evidence.
- [ ] OpenRouter is recommended in UI/settings copy where relevant but not required by code.
- [ ] Gemini/OpenAI users are not blocked from basic scoring.
- [ ] Meta-derived/internal analytics are used before benchmark fallback.
- [ ] Every recommendation has evidence and confidence.
- [ ] Mobile modal remains usable at 320px width.
- [ ] No existing caption/image generation flow regressed.
- [ ] `/api/recommend-next-slot` remains compatible.
- [ ] Existing unrelated dirty files are not reverted or committed.
