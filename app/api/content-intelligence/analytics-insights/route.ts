import { NextRequest, NextResponse } from "next/server"
import { loadContentIntelligenceSignals } from "../_shared"
import { generateAnalyticsInsights } from "@/lib/content-intelligence/analytics-insights"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import type { ContentPlatform } from "@/lib/content-intelligence/types"

export const runtime = "edge"

type AnalyticsRange = "last_7_days" | "last_30_days" | "last_90_days"

function normalizePlatform(value: string | null): ContentPlatform | "all" {
  return value === "instagram" ? value : "all"
}

function normalizeRange(value: string | null): AnalyticsRange {
  if (value === "last_7_days" || value === "last_30_days" || value === "last_90_days") return value
  return "last_30_days"
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const signals = await loadContentIntelligenceSignals(activeWorkspace.id)
    const result = generateAnalyticsInsights({
      signals,
      platform: normalizePlatform(request.nextUrl.searchParams.get("platform")),
      range: normalizeRange(request.nextUrl.searchParams.get("range")),
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[content-intelligence/analytics-insights]", error)
    return NextResponse.json({ error: "Failed to generate analytics insights" }, { status: 500 })
  }
}
