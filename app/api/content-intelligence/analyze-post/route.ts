import { NextRequest, NextResponse } from "next/server"
import { loadContentIntelligenceSignals } from "../_shared"
import { recommendHashtags } from "@/lib/content-intelligence/hashtags"
import { scorePostStrength } from "@/lib/content-intelligence/scoring"
import { recommendSlots } from "@/lib/content-intelligence/timing"
import { createClient } from "@/utils/supabase/server"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import type { ContentPlatform, PostIntelligenceInput, PostIntelligenceResult } from "@/lib/content-intelligence/types"

export const runtime = "edge"

function normalizePlatforms(value: unknown): ContentPlatform[] {
  const raw = Array.isArray(value) ? value : []
  const platforms = raw.filter((item): item is ContentPlatform => item === "instagram" || item === "facebook")
  return platforms.length > 0 ? platforms : ["instagram"]
}

function normalizeMediaUrls(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string" && url.trim().length > 0).slice(0, 10)
    : []
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getExplicitActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const input: PostIntelligenceInput = {
      workspaceId: activeWorkspace.id,
      caption: String(body?.caption || "").slice(0, 5000),
      platforms: normalizePlatforms(body?.platforms),
      mediaUrls: normalizeMediaUrls(body?.mediaUrls),
      scheduledAt: typeof body?.scheduledAt === "string" ? body.scheduledAt : null,
    }

    const signals = await loadContentIntelligenceSignals(activeWorkspace.id)
    const strength = scorePostStrength(input, signals)
    const hashtags = recommendHashtags(input, signals)
    const slots = recommendSlots({
      platform: input.platforms.length === 1 ? input.platforms[0] : "all",
      now: new Date(),
      signals,
    })
    const evidence = [
      ...strength.evidence,
      ...hashtags.flatMap((tag) => tag.evidence),
      ...slots.flatMap((slot) => slot.evidence),
    ]
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
