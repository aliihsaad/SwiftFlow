# Content Intelligence Phase 3 Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add evidence-backed analytics intelligence to the Analytics page so users can see what is working, what to try next, and the strongest patterns in their content history.

**Architecture:** Reuse the existing `lib/content-intelligence` signal layer from Phases 1 and 2. Add a deterministic analytics-insights module that turns internal analytics signals into explainable insight sections, expose it through an authenticated `/api/content-intelligence/analytics-insights` route, and render it as a compact responsive section on `/dashboard/analytics`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, SWR, lucide-react, Vitest.

---

## Design Source

Spec: `docs/superpowers/specs/2026-05-13-content-intelligence-design.md`

Phase 3 scope from the spec:

- `/api/content-intelligence/analytics-insights`.
- What is working section.
- What to try next section.
- Top pattern cards by topic, format, time, caption, hashtag.
- Evidence-backed growth insights.

Non-goals:

- No external trend providers.
- No audience comment/message mining.
- No subscription gating changes.
- No analytics sync behavior changes.

---

## File Structure

Create:

- `lib/content-intelligence/analytics-insights.ts`
  Deterministic insight generation from `ContentIntelligenceSignals`.

- `tests/content-intelligence/analytics-insights.test.ts`
  Pure tests for strong-history insights and sparse-history fallback.

- `app/api/content-intelligence/analytics-insights/route.ts`
  Authenticated GET route for Analytics page insight payloads.

- `components/analytics/content-intelligence-insights.tsx`
  Mobile-safe UI section for insight cards, experiments, patterns, and evidence.

Modify:

- `lib/content-intelligence/types.ts`
  Add analytics insight response types.

- `app/dashboard/analytics/page.tsx`
  Fetch and render analytics intelligence using current platform/range filters.

---

## Task 1: Add Analytics Insight Types And Tests

**Files:**

- Modify: `lib/content-intelligence/types.ts`
- Create: `tests/content-intelligence/analytics-insights.test.ts`

- [ ] **Step 1: Add failing tests**

Create tests that import `generateAnalyticsInsights` and assert:

- strong history produces a `what_is_working` insight using internal analytics evidence
- sparse history produces a low-confidence fallback experiment

Run:

```powershell
pnpm run test:ci -- tests/content-intelligence/analytics-insights.test.ts
```

Expected failure:

```text
Cannot find module '@/lib/content-intelligence/analytics-insights'
```

- [ ] **Step 2: Add analytics insight types**

Add response contracts to `types.ts`:

- `AnalyticsInsightKind`
- `AnalyticsInsightCard`
- `AnalyticsPatternCard`
- `AnalyticsExperiment`
- `AnalyticsInsightsResult`

- [ ] **Step 3: Commit**

```powershell
git add lib/content-intelligence/types.ts tests/content-intelligence/analytics-insights.test.ts
git commit -m "test: cover analytics intelligence insights"
```

---

## Task 2: Implement Deterministic Analytics Insight Generation

**Files:**

- Create: `lib/content-intelligence/analytics-insights.ts`

- [ ] **Step 1: Implement `generateAnalyticsInsights`**

Use only `ContentIntelligenceSignals` and deterministic logic:

- top posts become "what is working"
- best hashtags, caption length, platform mix, and posting hour become pattern cards
- missing history becomes fallback recommendations
- every user-facing claim carries `IntelligenceEvidence`

- [ ] **Step 2: Verify tests pass**

Run:

```powershell
pnpm run test:ci -- tests/content-intelligence/analytics-insights.test.ts
```

Expected:

```text
PASS tests/content-intelligence/analytics-insights.test.ts
```

- [ ] **Step 3: Commit**

```powershell
git add lib/content-intelligence/analytics-insights.ts
git commit -m "feat: add analytics intelligence generator"
```

---

## Task 3: Add Authenticated Analytics Insights API

**Files:**

- Create: `app/api/content-intelligence/analytics-insights/route.ts`

- [ ] **Step 1: Add API route**

The route must:

- require an authenticated user
- require an active workspace
- accept optional `platform` and `range` query params
- call `loadContentIntelligenceSignals`
- return `AnalyticsInsightsResult`

- [ ] **Step 2: Run type/lint checks for the route**

Run:

```powershell
pnpm exec eslint app/api/content-intelligence/analytics-insights/route.ts lib/content-intelligence/analytics-insights.ts tests/content-intelligence/analytics-insights.test.ts
```

- [ ] **Step 3: Commit**

```powershell
git add app/api/content-intelligence/analytics-insights/route.ts
git commit -m "feat: add analytics intelligence API"
```

---

## Task 4: Render Analytics Intelligence On The Dashboard

**Files:**

- Create: `components/analytics/content-intelligence-insights.tsx`
- Modify: `app/dashboard/analytics/page.tsx`

- [ ] **Step 1: Add responsive UI component**

Render:

- header with confidence/fallback status
- two-column desktop and single-column mobile insight cards
- pattern cards for topic/format/time/caption/hashtag
- compact evidence list
- empty/loading/error states

- [ ] **Step 2: Wire SWR fetch in Analytics page**

Fetch:

```text
/api/content-intelligence/analytics-insights?range=<range>&platform=<platformView>
```

Render the section after capability notices and before KPI cards.

- [ ] **Step 3: Run verification**

Run:

```powershell
pnpm run test:ci -- tests/content-intelligence/analytics-insights.test.ts
pnpm exec eslint components/analytics/content-intelligence-insights.tsx app/dashboard/analytics/page.tsx
pnpm run build
```

- [ ] **Step 4: Commit**

```powershell
git add components/analytics/content-intelligence-insights.tsx app/dashboard/analytics/page.tsx
git commit -m "feat: show analytics intelligence dashboard"
```

---

## Self-Review

- Spec coverage: The plan covers the Phase 3 API, what-is-working section, what-to-try-next section, pattern cards, and evidence-backed growth insights.
- Deferred scope: External trend providers, subscription gating, and audience mining remain intentionally deferred to later phases.
- Mobile requirement: The dashboard component must use single-column layout on mobile, wrapping text, and no fixed-width panels below 320px.
