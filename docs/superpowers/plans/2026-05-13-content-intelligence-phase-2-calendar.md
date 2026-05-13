# Content Intelligence Calendar Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add evidence-backed calendar posting-window intelligence: month heatmap, slot confidence labels, recommended-slot create flow, and drag/drop reschedule feedback.

**Architecture:** Extend the existing `lib/content-intelligence/timing.ts` module so slot recommendations can be produced for a whole visible date range while preserving the Phase 1 three-slot API behavior. The calendar fetches one month of recommendations from the authenticated slot route, renders compact mobile-safe indicators in each day cell, and passes selected slot times into the existing `CreatePostModal`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, existing `lib/content-intelligence` domain, `@dnd-kit/core`, Radix popover/tooltip, lucide-react, Vitest.

---

## Design Source

Spec: `docs/superpowers/specs/2026-05-13-content-intelligence-design.md`

Phase 2 scope from the spec:

- `/api/content-intelligence/recommend-slots`.
- Calendar heatmap overlay.
- Slot confidence labels.
- Apply recommended time from calendar into create modal.
- Reschedule feedback when dragging posts.

Already delivered in Phase 1 and reused here:

- `lib/content-intelligence/types.ts`
- `lib/content-intelligence/evidence.ts`
- `lib/content-intelligence/timing.ts`
- `app/api/content-intelligence/recommend-slots/route.ts`
- `app/api/content-intelligence/_shared.ts`
- `components/create/create-post-modal.tsx`

Non-goals for Phase 2:

- No external trend provider integration.
- No subscription gating changes.
- No calendar redesign outside the existing month view.
- No auto-scheduling or auto-publishing.

---

## File Structure

Modify:

- `lib/content-intelligence/types.ts`  
  Add a small calendar-specific strength label type if the UI needs a stable `strong | okay | weak` contract.

- `lib/content-intelligence/timing.ts`  
  Add range-based slot generation and a helper that classifies an arbitrary scheduled datetime against recommendations.

- `tests/content-intelligence/timing.test.ts`  
  Cover range generation, past-date filtering, and drag/drop slot classification.

- `app/api/content-intelligence/recommend-slots/route.ts`  
  Accept optional `start`, `end`, `platform`, and `limitPerDay` query params. Existing callers without range params still receive the Phase 1 top three slots.

- `components/dashboard/calendar-view.tsx`  
  Fetch month recommendations, render compact heatmap indicators and slot popovers, open `CreatePostModal` with a selected recommendation, and add reschedule feedback after drag/drop.

Do not modify:

- Unrelated dirty docs and Supabase temp files already present in the working tree.
- Existing automation files.
- Existing publishing modal code unless the calendar handoff exposes a concrete bug.

---

## Data Contract

Existing `RecommendedSlot` remains the main API shape:

```ts
export interface RecommendedSlot {
  startsAt: string
  platform: ContentPlatform | "all"
  score: number
  confidence: IntelligenceConfidence
  reason: string
  evidence: IntelligenceEvidence[]
}
```

Add this type only if it makes the UI code clearer:

```ts
export type SlotStrengthLabel = "strong" | "okay" | "weak"
```

Calendar API response when range params are present:

```ts
{
  "slots": [
    {
      "startsAt": "2026-05-14T09:00:00.000Z",
      "platform": "instagram",
      "score": 92,
      "confidence": "high",
      "reason": "Historically stronger instagram posts were published around 09:00 UTC.",
      "evidence": []
    }
  ],
  "generatedAt": "2026-05-13T12:00:00.000Z",
  "range": {
    "start": "2026-05-01T00:00:00.000Z",
    "end": "2026-05-31T23:59:59.999Z"
  }
}
```

Calendar API response without range params remains compatible:

```ts
{
  "slots": [
    {
      "startsAt": "2026-05-14T09:00:00.000Z",
      "platform": "all",
      "score": 55,
      "confidence": "low",
      "reason": "Limited workspace history; using conservative benchmark posting windows.",
      "evidence": []
    }
  ]
}
```

---

## Task 1: Extend Timing Tests For Calendar Range Logic

**Files:**

- Modify: `tests/content-intelligence/timing.test.ts`

- [ ] **Step 1: Add failing range tests**

Update the existing import in `tests/content-intelligence/timing.test.ts`:

```ts
import { classifySlotStrength, recommendCalendarSlots, recommendSlots } from "@/lib/content-intelligence/timing"
```

Append these tests inside the existing `describe("recommendSlots", () => { ... })` block:

```ts

it("returns range-based calendar slots and excludes past times", () => {
  const signals: ContentIntelligenceSignals = {
    brand: null,
    history: {
      totalPublishedPosts: 10,
      topPosts: [],
      hashtagPerformance: [],
      hourlyPerformance: [
        { platform: "instagram", dayOfWeek: 4, hour: 9, posts: 6, averageScore: 28 },
        { platform: "instagram", dayOfWeek: 5, hour: 18, posts: 2, averageScore: 12 },
      ],
    },
    capabilities: { hasMetaInsights: true, hasFacebookEngagement: false },
  }

  const slots = recommendCalendarSlots({
    platform: "instagram",
    now: new Date("2026-05-13T12:00:00.000Z"),
    startDate: new Date("2026-05-13T00:00:00.000Z"),
    endDate: new Date("2026-05-16T23:59:59.999Z"),
    signals,
    limitPerDay: 2,
  })

  expect(slots.length).toBeGreaterThanOrEqual(2)
  expect(slots.every((slot) => new Date(slot.startsAt) > new Date("2026-05-13T12:00:00.000Z"))).toBe(true)
  expect(slots.some((slot) => slot.confidence === "high")).toBe(true)
})

it("classifies dropped scheduled times against recommended calendar slots", () => {
  const recommendedAt = "2026-05-14T09:00:00.000Z"
  const slots = [
    {
      startsAt: recommendedAt,
      platform: "instagram" as const,
      score: 91,
      confidence: "high" as const,
      reason: "Strong history.",
      evidence: [],
    },
  ]

  expect(classifySlotStrength(new Date("2026-05-14T09:15:00.000Z"), slots)).toEqual({
    label: "strong",
    score: 91,
    confidence: "high",
    nearestSlot: recommendedAt,
  })
  expect(classifySlotStrength(new Date("2026-05-14T23:00:00.000Z"), slots).label).toBe("weak")
})
```

- [ ] **Step 2: Run tests to verify the expected failure**

Run:

```powershell
pnpm run test:ci
```

Expected:

```text
No exported member 'recommendCalendarSlots'
No exported member 'classifySlotStrength'
```

- [ ] **Step 3: Commit the failing tests**

```powershell
git add tests/content-intelligence/timing.test.ts
git commit -m "test: cover calendar slot recommendations"
```

---

## Task 2: Implement Range Slot Generation And Classification

**Files:**

- Modify: `lib/content-intelligence/types.ts`
- Modify: `lib/content-intelligence/timing.ts`

- [ ] **Step 1: Add the slot strength type**

Add to `lib/content-intelligence/types.ts` near the timing types:

```ts
export type SlotStrengthLabel = "strong" | "okay" | "weak"
```

- [ ] **Step 2: Replace `timing.ts` with range-aware helpers while preserving `recommendSlots`**

Use this structure in `lib/content-intelligence/timing.ts`:

```ts
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
    return platformRows.slice(0, 3).map((row) => ({
      ...slotFromHistory({
        platform,
        rowPlatform: row.platform,
        day: nextDateFor(row.dayOfWeek, row.hour, now),
        hour: row.hour,
        posts: row.posts,
        averageScore: row.averageScore,
      }),
      startsAt: nextDateFor(row.dayOfWeek, row.hour, now).toISOString(),
    }))
  }

  return BENCHMARK_HOURS.map((hour, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() + (index === 0 ? 1 : index + 1))
    date.setUTCHours(hour, 0, 0, 0)
    return benchmarkSlot(platform, date, hour, index)
  })
}
```

- [ ] **Step 3: Run the timing tests**

Run:

```powershell
pnpm run test:ci
```

Expected:

```text
5 tests passed
```

- [ ] **Step 4: Commit**

```powershell
git add lib/content-intelligence/types.ts lib/content-intelligence/timing.ts tests/content-intelligence/timing.test.ts
git commit -m "feat: add calendar slot intelligence"
```

---

## Task 3: Extend The Slot API For Calendar Range Requests

**Files:**

- Modify: `app/api/content-intelligence/recommend-slots/route.ts`

- [ ] **Step 1: Add date parsing helpers**

In `app/api/content-intelligence/recommend-slots/route.ts`, add:

```ts
function parseDateParam(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

function parseLimitPerDay(value: string | null): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 2
  return Math.max(1, Math.min(Math.round(parsed), 3))
}
```

- [ ] **Step 2: Route range requests to `recommendCalendarSlots`**

Update imports:

```ts
import { recommendCalendarSlots, recommendSlots } from "@/lib/content-intelligence/timing"
```

Inside `GET`, after loading signals:

```ts
const platform = normalizePlatform(request.nextUrl.searchParams.get("platform"))
const start = parseDateParam(request.nextUrl.searchParams.get("start"))
const end = parseDateParam(request.nextUrl.searchParams.get("end"))

if (start && end && end >= start) {
  const slots = recommendCalendarSlots({
    platform,
    now: new Date(),
    startDate: start,
    endDate: end,
    limitPerDay: parseLimitPerDay(request.nextUrl.searchParams.get("limitPerDay")),
    signals,
  })

  return NextResponse.json({
    slots,
    generatedAt: new Date().toISOString(),
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
  })
}

const slots = recommendSlots({
  platform,
  now: new Date(),
  signals,
}).slice(0, 3)

return NextResponse.json({ slots })
```

- [ ] **Step 3: Run targeted lint**

Run:

```powershell
pnpm exec eslint app/api/content-intelligence/recommend-slots/route.ts lib/content-intelligence/timing.ts tests/content-intelligence/timing.test.ts
```

Expected:

```text
No output and exit code 0.
```

- [ ] **Step 4: Commit**

```powershell
git add app/api/content-intelligence/recommend-slots/route.ts
git commit -m "feat: support calendar slot range API"
```

---

## Task 4: Add Calendar Intelligence State And Fetching

**Files:**

- Modify: `components/dashboard/calendar-view.tsx`

- [ ] **Step 1: Add imports and types**

Update imports:

```tsx
import { useState, useEffect, useMemo, useCallback } from "react"
import { Clock, Sparkles } from "lucide-react"
import { classifySlotStrength } from "@/lib/content-intelligence/timing"
import type { RecommendedSlot } from "@/lib/content-intelligence/types"
```

Keep existing lucide icons by merging imports into one import line:

```tsx
import { Facebook, Instagram, ChevronLeft, ChevronRight, GripVertical, Plus, Clock, Sparkles } from "lucide-react"
```

- [ ] **Step 2: Add state to `CalendarView`**

Add after `today` state:

```tsx
const [recommendedSlots, setRecommendedSlots] = useState<RecommendedSlot[]>([])
const [isLoadingSlots, setIsLoadingSlots] = useState(false)
const [slotsError, setSlotsError] = useState<string | null>(null)
```

- [ ] **Step 3: Add range helpers inside `CalendarView`**

Add after `goToToday`:

```tsx
const visibleRange = useMemo(() => {
  if (!currentDate) return null
  const start = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth(), 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999))
  return { start, end }
}, [currentDate])

const slotsByDay = useMemo(() => {
  const map = new Map<string, RecommendedSlot[]>()
  for (const slot of recommendedSlots) {
    const date = new Date(slot.startsAt)
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const existing = map.get(key) || []
    existing.push(slot)
    map.set(key, existing.sort((a, b) => b.score - a.score))
  }
  return map
}, [recommendedSlots])

const getSlotsForDay = useCallback((day: number | null) => {
  if (!day) return []
  return slotsByDay.get(`${currentYear}-${currentMonth}-${day}`) || []
}, [currentMonth, currentYear, slotsByDay])
```

- [ ] **Step 4: Fetch visible-month slots**

Add this effect after `visibleRange` exists:

```tsx
useEffect(() => {
  if (!visibleRange) return

  let cancelled = false
  const loadSlots = async () => {
    setIsLoadingSlots(true)
    setSlotsError(null)
    try {
      const params = new URLSearchParams({
        start: visibleRange.start.toISOString(),
        end: visibleRange.end.toISOString(),
        limitPerDay: "2",
      })
      const response = await fetch(`/api/content-intelligence/recommend-slots?${params.toString()}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || "Failed to load recommended slots")
      if (!cancelled) setRecommendedSlots(Array.isArray(data?.slots) ? data.slots : [])
    } catch (error) {
      if (!cancelled) {
        setRecommendedSlots([])
        setSlotsError(error instanceof Error ? error.message : "Failed to load recommended slots")
      }
    } finally {
      if (!cancelled) setIsLoadingSlots(false)
    }
  }

  loadSlots()
  return () => {
    cancelled = true
  }
}, [visibleRange])
```

- [ ] **Step 5: Run targeted lint**

Run:

```powershell
pnpm exec eslint components/dashboard/calendar-view.tsx
```

Expected:

```text
No output and exit code 0.
```

- [ ] **Step 6: Commit**

```powershell
git add components/dashboard/calendar-view.tsx
git commit -m "feat: load calendar intelligence slots"
```

---

## Task 5: Render Mobile-Safe Heatmap And Slot Actions

**Files:**

- Modify: `components/dashboard/calendar-view.tsx`

- [ ] **Step 1: Extend `DroppableCalendarCell` props**

Add props:

```tsx
recommendedSlots?: RecommendedSlot[]
onAddRecommendedPost?: (slot: RecommendedSlot) => void
```

Update the prop type and function signature.

- [ ] **Step 2: Add compact cell strength styling**

Inside `DroppableCalendarCell`, before `return`, add:

```tsx
const topSlot = recommendedSlots?.[0] || null
const slotTone = topSlot?.score && topSlot.score >= 80 ? "strong" : topSlot?.score && topSlot.score >= 60 ? "okay" : topSlot ? "weak" : null
const slotAccent =
  slotTone === "strong"
    ? "rgba(16,185,129,0.28)"
    : slotTone === "okay"
      ? "rgba(245,158,11,0.22)"
      : slotTone === "weak"
        ? "rgba(255,255,255,0.12)"
        : "transparent"
```

Merge `slotAccent` into the cell style without overriding today/drag outlines:

```tsx
background: !isCurrentMonth
  ? "rgba(255,255,255,0.015)"
  : topSlot
    ? `linear-gradient(180deg, ${slotAccent}, rgba(16,17,26,0.98) 42%)`
    : CAL_THEME.panelAlt,
```

- [ ] **Step 3: Add a tiny heatmap indicator and popover**

Add this inside the day header controls next to the post count:

```tsx
{topSlot && (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className="flex h-5 max-w-[72px] items-center gap-1 rounded px-1 text-[10px] font-medium"
        style={{
          background: slotTone === "strong" ? "rgba(16,185,129,0.12)" : "rgba(245,158,11,0.10)",
          color: slotTone === "strong" ? "#86efac" : "#fbbf24",
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        title="Recommended time"
      >
        <Clock className="h-3 w-3 shrink-0" />
        <span className="hidden sm:inline">{new Date(topSlot.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
      </button>
    </PopoverTrigger>
    <PopoverContent className="w-64 p-0 text-sm">
      <div className="space-y-3 p-3" style={{ background: CAL_THEME.panel }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: CAL_THEME.text }}>Recommended window</p>
            <p className="text-xs" style={{ color: CAL_THEME.textMuted }}>{topSlot.confidence} confidence</p>
          </div>
          <span className="rounded px-2 py-1 text-xs font-semibold" style={{ background: "rgba(16,185,129,0.12)", color: "#86efac" }}>
            {topSlot.score}
          </span>
        </div>
        <div className="space-y-2">
          {(recommendedSlots || []).slice(0, 2).map((slot) => (
            <button
              key={slot.startsAt}
              type="button"
              className="w-full rounded border px-2 py-2 text-left transition-colors hover:bg-white/[0.04]"
              style={{ borderColor: CAL_THEME.border }}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onAddRecommendedPost?.(slot)
              }}
            >
              <span className="block text-xs font-medium" style={{ color: CAL_THEME.text }}>
                {new Date(slot.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
              <span className="line-clamp-2 text-[11px]" style={{ color: CAL_THEME.textMuted }}>{slot.reason}</span>
            </button>
          ))}
        </div>
      </div>
    </PopoverContent>
  </Popover>
)}
```

Mobile constraints:

- The button uses an icon-only display below `sm`.
- The popover is `w-64`, which fits a 320px viewport with Radix collision handling.
- The day cell remains `min-h-[60px]` on mobile.

- [ ] **Step 4: Pass day slots from `CalendarView`**

When rendering `DroppableCalendarCell`, pass:

```tsx
recommendedSlots={getSlotsForDay(cell.day)}
onAddRecommendedPost={handleAddRecommendedPost}
```

- [ ] **Step 5: Add loading/error status in card header**

Under the title row inside `CardHeader`, add a compact line:

```tsx
<div className="flex items-center gap-2 text-xs" style={{ color: slotsError ? CAL_THEME.coral : CAL_THEME.textMuted }}>
  <Sparkles className="h-3.5 w-3.5" />
  <span>{slotsError ? "Recommendations unavailable" : isLoadingSlots ? "Loading recommended windows" : "Recommended windows shown by score"}</span>
</div>
```

Ensure this text wraps normally and does not force the header wider than the viewport.

- [ ] **Step 6: Commit**

```powershell
git add components/dashboard/calendar-view.tsx
git commit -m "feat: show calendar slot heatmap"
```

---

## Task 6: Wire Recommended Slot Create Flow And Reschedule Feedback

**Files:**

- Modify: `components/dashboard/calendar-view.tsx`

- [ ] **Step 1: Add recommended-slot create handler**

Add near `handleAddPost`:

```tsx
const handleAddRecommendedPost = (slot: RecommendedSlot) => {
  const date = new Date(slot.startsAt)
  if (!Number.isFinite(date.getTime())) return
  setSelectedDate(date)
  setIsCreateModalOpen(true)
}
```

- [ ] **Step 2: Add drag/drop classification**

Inside `handleDragEnd`, after preserving the original time and before the optimistic update, add:

```tsx
const slotStrength = classifySlotStrength(newDate, recommendedSlots)
```

Update the successful toast:

```tsx
toast({
  title: "Post rescheduled",
  description:
    slotStrength.label === "strong"
      ? `Moved to a strong recommended window (${slotStrength.score}/100).`
      : slotStrength.label === "okay"
        ? `Moved to an okay posting window (${slotStrength.score}/100).`
        : "Moved outside the strongest recommended windows.",
})
```

- [ ] **Step 3: Keep normal date add behavior**

Keep `handleAddPost` as:

```tsx
const handleAddPost = (date: Date) => {
  setSelectedDate(date)
  setIsCreateModalOpen(true)
}
```

This keeps the plus button behavior unchanged while the recommendation popover uses the exact recommended time.

- [ ] **Step 4: Run changed-file lint**

Run:

```powershell
pnpm exec eslint components/dashboard/calendar-view.tsx lib/content-intelligence/timing.ts app/api/content-intelligence/recommend-slots/route.ts tests/content-intelligence/timing.test.ts
```

Expected:

```text
No output and exit code 0.
```

- [ ] **Step 5: Commit**

```powershell
git add components/dashboard/calendar-view.tsx
git commit -m "feat: apply calendar recommended slots"
```

---

## Task 7: Verification And Push

**Files:**

- All files from prior tasks.

- [ ] **Step 1: Run unit tests**

Run:

```powershell
pnpm run test:ci
```

Expected:

```text
All content-intelligence tests pass.
```

- [ ] **Step 2: Run changed-file lint**

Run:

```powershell
pnpm exec eslint components/dashboard/calendar-view.tsx lib/content-intelligence/types.ts lib/content-intelligence/timing.ts app/api/content-intelligence/recommend-slots/route.ts tests/content-intelligence/timing.test.ts
```

Expected:

```text
No output and exit code 0.
```

Note: full `pnpm run lint` may still fail because of unrelated repo-wide lint debt that predates Phase 1. Do not hide changed-file lint failures.

- [ ] **Step 3: Run production build**

Load `.env.local` into the shell before building:

```powershell
$envFile = '.env.local'
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), 'Process')
}
pnpm run build
```

Expected:

```text
Compiled successfully
```

If the build fails because Google Fonts cannot be fetched under restricted network, rerun the same build command with escalated network permission.

- [ ] **Step 4: Manual mobile verification**

Start the dev server:

```powershell
pnpm run dev
```

Verify the dashboard calendar at:

- Desktop width around 1280px.
- Mobile width around 390px.
- Narrow mobile width around 320px.

Acceptance checks:

- Calendar has no horizontal scroll at 320px.
- Day cells still have stable size.
- Recommendation indicators are icon-only or compact on mobile.
- Slot popover fits inside the viewport.
- Clicking a recommended slot opens `CreatePostModal` with that time prefilled.
- Dragging a post to a recommended day shows strong/okay/weak feedback.
- Existing plus-button create flow still opens the modal with the selected date.

- [ ] **Step 5: Status check**

Run:

```powershell
git status --short
```

Expected:

```text
Only Phase 2 files and the known unrelated pre-existing dirty files appear.
```

Known unrelated pre-existing dirty files:

```text
docs/app-review/scripts/meta-review-screencast-phase-1.md
docs/superpowers/plans/2026-05-06-mobile-friendly-automation-wizard.md
supabase/.temp/cli-latest
docs/app-review/ops/database-retention-cleanup-draft-2026-04-09.md
docs/review-results/
docs/superpowers/plans/2026-05-07-automation-template-gallery.md
```

- [ ] **Step 6: Push**

Run:

```powershell
git push
```

Expected:

```text
master pushed to origin.
```

---

## Review Checklist

Before marking Phase 2 complete:

- [ ] Existing `/api/content-intelligence/recommend-slots` callers still work without `start` and `end`.
- [ ] Calendar range requests return more than three slots for a visible month.
- [ ] Slot output includes confidence and evidence.
- [ ] Calendar UI is mobile-friendly at 320px and 390px.
- [ ] Heatmap indicators do not obscure post badges.
- [ ] Slot popovers use concise copy and fit mobile.
- [ ] Recommended-slot create flow passes the exact date/time into `CreatePostModal`.
- [ ] Drag/drop reschedule feedback is based on the month recommendation set.
- [ ] Changed-file lint and `pnpm run test:ci` pass.
- [ ] Production build passes after loading `.env.local`.
- [ ] Unrelated dirty files are not committed or reverted.
