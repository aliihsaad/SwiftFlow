import { NextRequest, NextResponse } from "next/server"
import { buildTrendReport } from "@/lib/content-intelligence/research"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
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
    assertJsonBodySize(request)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getActiveWorkspace()
    if (!activeWorkspace) return NextResponse.json({ error: "No active workspace found" }, { status: 404 })

    const body = await request.json().catch(() => ({}))
    const topic = String(body?.topic || "").trim().slice(0, 240)
    if (!topic) return NextResponse.json({ error: "topic is required" }, { status: 400 })

    const depth = normalizeDepth(body?.depth)
    const clientIp = getClientIp(request)
    await enforceRateLimit(
      {
        scope: "content-intelligence:trend-report:user",
        subject: `${user.id}:${activeWorkspace.id}`,
        limit: depth === "deep" ? 3 : 10,
        windowSeconds: 15 * 60,
      },
      "Too many trend research requests. Please wait a moment and try again.",
    )
    await enforceRateLimit(
      {
        scope: "content-intelligence:trend-report:ip",
        subject: clientIp,
        limit: 30,
        windowSeconds: 15 * 60,
      },
      "Too many trend research requests. Please wait a moment and try again.",
    )

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
    if (error instanceof RateLimitExceededError) {
      return NextResponse.json(
        { error: error.message },
        { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
      )
    }
    if (error instanceof Error && /Request payload too large|Invalid content length/i.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error("[content-intelligence/trend-report]", redactSensitiveLogValue(error))
    return NextResponse.json({ error: "Failed to generate trend report" }, { status: 500 })
  }
}
