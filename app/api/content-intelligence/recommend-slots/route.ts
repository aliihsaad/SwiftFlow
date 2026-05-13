import { NextRequest, NextResponse } from "next/server"
import { loadContentIntelligenceSignals } from "../_shared"
import { recommendCalendarSlots, recommendSlots } from "@/lib/content-intelligence/timing"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import type { ContentPlatform } from "@/lib/content-intelligence/types"

export const runtime = "edge"

function normalizePlatform(value: string | null): ContentPlatform | "all" {
  return value === "instagram" || value === "facebook" ? value : "all"
}

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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const signals = await loadContentIntelligenceSignals(activeWorkspace.id)
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
  } catch (error) {
    console.error("[content-intelligence/recommend-slots]", error)
    return NextResponse.json({ error: "Failed to recommend slots" }, { status: 500 })
  }
}
