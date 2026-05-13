# Content Intelligence Phase 4 Research Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 4 foundation for external trend providers, research source quality controls, and subscription-gated deep trend reports without enabling unreviewed provider calls by default.

**Architecture:** Keep all provider behavior behind pure `lib/content-intelligence/research.ts` interfaces so scoring, analytics, and future UI can consume normalized research findings. External providers are dormant adapters until API keys and legal/cost review are complete. The new trend-report API authenticates the active workspace and returns an explicit paid-plan gate when billing entitlements are not live.

**Tech Stack:** Next.js 16 route handlers, Supabase auth/workspace lookup, TypeScript domain modules, Vitest.

---

## File Structure

- Modify `lib/content-intelligence/types.ts`
  Adds normalized research provider, source quality, gated report, and provider status types.
- Modify `lib/content-intelligence/research.ts`
  Owns provider selection, source scoring, dormant provider adapters, fallback behavior, and deep report generation.
- Create `app/api/content-intelligence/trend-report/route.ts`
  Authenticated workspace route for Phase 4 deep trend reports.
- Create `tests/content-intelligence/research.test.ts`
  Pure tests for source quality, provider fallbacks, report gating, and injected provider normalization.

## Task 1: Research Contracts

**Files:**
- Modify: `lib/content-intelligence/types.ts`
- Test: `tests/content-intelligence/research.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest"
import { assessResearchSourceQuality, buildTrendReport, researchContentTopic } from "@/lib/content-intelligence/research"

describe("content intelligence research", () => {
  it("scores primary recent sources higher than low-quality social-only sources", () => {
    const primary = assessResearchSourceQuality({
      url: "https://developers.facebook.com/docs/instagram-platform",
      title: "Instagram Platform documentation",
      publishedAt: "2026-05-12T00:00:00.000Z",
    })
    const weak = assessResearchSourceQuality({
      url: "https://example-social-feed.test/post/123",
      title: "viral post",
      publishedAt: "2024-01-01T00:00:00.000Z",
    })

    expect(primary.score).toBeGreaterThan(weak.score)
    expect(primary.tier).toBe("primary")
    expect(weak.tier).toBe("low")
  })

  it("returns an explicit paid-plan gate for deep reports when entitlements are unavailable", async () => {
    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "AI coding assistants",
      platform: "instagram",
      depth: "deep",
      entitlement: { enabled: false, tier: "free", reason: "billing_not_live" },
    })

    expect(report.gating.allowed).toBe(false)
    expect(report.gating.requiredTier).toBe("pro")
    expect(report.findings).toEqual([])
  })

  it("normalizes injected provider findings with source quality evidence", async () => {
    const result = await researchContentTopic({
      workspaceId: "workspace-1",
      topic: "AI agents",
      provider: "dataforseo",
      adapters: {
        dataforseo: {
          id: "dataforseo",
          label: "DataForSEO",
          isConfigured: () => true,
          search: async () => [
            {
              title: "AI agent adoption report",
              summary: "A recent report covers AI agent adoption.",
              url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights",
              provider: "dataforseo",
              publishedAt: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
      },
    })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].sourceQuality?.tier).toBe("primary")
    expect(result.evidence[0].sourceType).toBe("trend_provider")
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm run test:ci -- tests/content-intelligence/research.test.ts`

Expected: FAIL because the exported Phase 4 functions and types do not exist yet.

## Task 2: Provider Framework and Quality Controls

**Files:**
- Modify: `lib/content-intelligence/types.ts`
- Modify: `lib/content-intelligence/research.ts`
- Test: `tests/content-intelligence/research.test.ts`

- [ ] **Step 1: Add the minimal types and implementation**

Add provider ids for `openrouter`, `gemini`, `openai`, `dataforseo`, `serpapi`, `google_trends`, `social_intelligence`, and `benchmark`. Add `SourceQuality`, `TrendReportResult`, and adapter interfaces. Implement:

- `assessResearchSourceQuality(source)`
- `createDefaultResearchAdapters()`
- `researchContentTopic(request)`
- `buildTrendReport(request)`

The default adapters must return `provider_not_configured` unless an API key is present. No live network fetch is added in this phase.

- [ ] **Step 2: Run the focused test and verify GREEN**

Run: `pnpm run test:ci -- tests/content-intelligence/research.test.ts`

Expected: PASS.

## Task 3: Authenticated Trend Report API

**Files:**
- Create: `app/api/content-intelligence/trend-report/route.ts`

- [ ] **Step 1: Implement the route**

Use the same auth and active workspace pattern as `analytics-insights/route.ts`. Normalize `topic`, `platform`, `provider`, and `depth`. For now, pass `{ enabled: false, tier: "free", reason: "billing_not_live" }` for `deep` reports because billing/entitlements are not live.

- [ ] **Step 2: Verify unauthorized behavior**

Run a build or route smoke check. Expected unauthenticated requests return `401`.

## Task 4: Verification and Push

**Files:**
- All files changed in this plan.

- [ ] **Step 1: Run Content Intelligence tests**

Run: `pnpm run test:ci -- tests/content-intelligence`

Expected: PASS.

- [ ] **Step 2: Run targeted lint**

Run: `pnpm exec eslint lib/content-intelligence/research.ts lib/content-intelligence/types.ts app/api/content-intelligence/trend-report/route.ts tests/content-intelligence/research.test.ts`

Expected: no errors.

- [ ] **Step 3: Run production build**

Run the normal `.env.local` loading pattern and `pnpm run build`.

Expected: PASS.

- [ ] **Step 4: Commit and push**

Run:

```bash
git add docs/superpowers/plans/2026-05-13-content-intelligence-phase-4-research.md lib/content-intelligence/types.ts lib/content-intelligence/research.ts app/api/content-intelligence/trend-report/route.ts tests/content-intelligence/research.test.ts
git commit -m "feat: add content intelligence research foundation"
git push origin HEAD:master
```

Expected: commit pushed to `origin/master`.

## Self-Review

- Spec coverage: Covers optional provider adapters, source quality controls, subscription-gated deeper reports, and leaves social intelligence dormant pending legal/cost review.
- Placeholder scan: No TODO/TBD placeholders in implementation steps.
- Type consistency: Tests and implementation use the same function and type names.
