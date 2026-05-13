import { NextRequest, NextResponse } from "next/server"
import { buildTrendReport } from "@/lib/content-intelligence/research"
import { createClient } from "@/utils/supabase/server"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import type { ContentPlatform, ResearchProviderId } from "@/lib/content-intelligence/types"

export const runtime = "edge"

const PROVIDERS = new Set<ResearchProviderId>([
  "openrouter",
  "gemini",
  "openai",
  "dataforseo",
  "serpapi",
  "google_trends",
  "social_intelligence",
  "benchmark",
])

function normalizePlatform(value: unknown): ContentPlatform | "all" {
  return value === "instagram" || value === "facebook" ? value : "all"
}

function normalizeDepth(value: unknown): "standard" | "deep" {
  return value === "deep" ? "deep" : "standard"
}

function normalizeProvider(value: unknown): ResearchProviderId | "auto" {
  return typeof value === "string" && PROVIDERS.has(value as ResearchProviderId) ? (value as ResearchProviderId) : "auto"
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const topic = String(body?.topic || "").trim().slice(0, 240)
    if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 })

    const depth = normalizeDepth(body?.depth)
    const report = await buildTrendReport({
      workspaceId: activeWorkspace.id,
      topic,
      platform: normalizePlatform(body?.platform),
      provider: normalizeProvider(body?.provider),
      depth,
      entitlement: {
        enabled: false,
        tier: "free",
        reason: depth === "deep" ? "billing_not_live" : undefined,
      },
    })

    return NextResponse.json(report)
  } catch (error) {
    console.error("[content-intelligence/trend-report]", error)
    return NextResponse.json({ error: "Failed to generate trend report" }, { status: 500 })
  }
}
