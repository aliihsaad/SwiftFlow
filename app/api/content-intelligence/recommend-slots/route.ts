import { NextRequest, NextResponse } from "next/server"
import { loadContentIntelligenceSignals } from "../_shared"
import { recommendSlots } from "@/lib/content-intelligence/timing"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import type { ContentPlatform } from "@/lib/content-intelligence/types"

export const runtime = "edge"

function normalizePlatform(value: string | null): ContentPlatform | "all" {
  return value === "instagram" || value === "facebook" ? value : "all"
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const signals = await loadContentIntelligenceSignals(activeWorkspace.id)
    const slots = recommendSlots({
      platform: normalizePlatform(request.nextUrl.searchParams.get("platform")),
      now: new Date(),
      signals,
    }).slice(0, 3)

    return NextResponse.json({ slots })
  } catch (error) {
    console.error("[content-intelligence/recommend-slots]", error)
    return NextResponse.json({ error: "Failed to recommend slots" }, { status: 500 })
  }
}
