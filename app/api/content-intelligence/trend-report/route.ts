import { NextRequest, NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildTrendReport } from "@/lib/content-intelligence/research"
import {
  createGeminiResearchAdapter,
  GEMINI_RESEARCH_DEFAULT_MODEL,
} from "@/lib/content-intelligence/gemini-research"
import { assertJsonBodySize } from "@/lib/security/phase1-validation"
import { enforceRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getExplicitActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspaceEntitlements } from "@/lib/billing/entitlements"
import { getWorkspaceSettingsWithSecrets } from "@/lib/workspace-settings"
import type { ContentPlatform, ResearchProviderId, TrendReportResult } from "@/lib/content-intelligence/types"
import type { WorkspaceSettings } from "@/types/settings"

// Node runtime: workspace API keys are decrypted with node:crypto.
export const runtime = "nodejs"
export const maxDuration = 60

const TREND_REPORT_CACHE_TTL_MS = 12 * 60 * 60 * 1000

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
  return value === "instagram" ? value : "all"
}

function normalizeDepth(value: unknown): "standard" | "deep" {
  return value === "deep" ? "deep" : "standard"
}

function normalizeProvider(value: unknown): ResearchProviderId | "auto" {
  return typeof value === "string" && PROVIDERS.has(value as ResearchProviderId) ? (value as ResearchProviderId) : "auto"
}

function normalizeApiKey(value: string | null | undefined): string {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "")
}

function resolveGeminiResearchModel(settings: WorkspaceSettings | null): string {
  if (settings?.ai_provider !== "gemini") return GEMINI_RESEARCH_DEFAULT_MODEL
  const model = String(settings.ai_text_model_name || settings.ai_model_name || "")
    .trim()
    .replace(/^models\//, "")
  if (!model || model.startsWith("gpt-")) return GEMINI_RESEARCH_DEFAULT_MODEL
  return model
}

type CacheKey = {
  workspaceId: string
  topic: string
  platform: ContentPlatform | "all"
  depth: "standard" | "deep"
}

async function readCachedReport(admin: SupabaseClient, key: CacheKey): Promise<TrendReportResult | null> {
  const { data, error } = await admin
    .from("workspace_trend_report_cache")
    .select("report, generated_at")
    .eq("workspace_id", key.workspaceId)
    .eq("topic", key.topic)
    .eq("platform", key.platform)
    .eq("depth", key.depth)
    .maybeSingle()

  if (error || !data) return null
  const age = Date.now() - new Date(data.generated_at as string).getTime()
  if (!Number.isFinite(age) || age > TREND_REPORT_CACHE_TTL_MS) return null
  return data.report as TrendReportResult
}

async function writeCachedReport(admin: SupabaseClient, key: CacheKey, report: TrendReportResult): Promise<void> {
  // Best-effort: a cache write failure must never fail the report response.
  const { error } = await admin
    .from("workspace_trend_report_cache")
    .upsert(
      {
        workspace_id: key.workspaceId,
        topic: key.topic,
        platform: key.platform,
        depth: key.depth,
        report,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,topic,platform,depth" },
    )
  if (error) {
    console.error("[content-intelligence/trend-report] cache write failed", redactSensitiveLogValue(error))
  }
}

export async function POST(request: NextRequest) {
  try {
    assertJsonBodySize(request)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const activeWorkspace = await getExplicitActiveWorkspace()
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

    // Deep reports unlock from the billing entitlement reader (Stripe-synced
    // subscription state or manual entitlement overrides).
    const entitlements = await getWorkspaceEntitlements(activeWorkspace.id)
    const deepEnabled = entitlements.limits.deepTrendReportsEnabled && entitlements.effectiveTier !== "free"
    const deepAllowed = depth === "deep" && deepEnabled

    const platform = normalizePlatform(body?.platform)
    const cacheKey: CacheKey = {
      workspaceId: activeWorkspace.id,
      topic: topic.toLowerCase(),
      platform,
      depth,
    }

    // Live deep research is served from a ~12h cache before hitting Gemini.
    let admin: SupabaseClient | null = null
    let geminiAdapter: ReturnType<typeof createGeminiResearchAdapter> | undefined
    if (deepAllowed) {
      admin = createAdminClient()
      const cached = await readCachedReport(admin, cacheKey)
      if (cached) return NextResponse.json(cached)

      const settings = await getWorkspaceSettingsWithSecrets(activeWorkspace.id)
      const geminiKey = normalizeApiKey(settings?.gemini_api_key) || normalizeApiKey(process.env.GEMINI_API_KEY)
      geminiAdapter = createGeminiResearchAdapter({
        apiKey: geminiKey,
        model: resolveGeminiResearchModel(settings),
      })
    }

    const report = await buildTrendReport({
      workspaceId: activeWorkspace.id,
      topic,
      platform,
      provider: normalizeProvider(body?.provider),
      depth,
      adapters: geminiAdapter ? { gemini: geminiAdapter } : undefined,
      entitlement: {
        enabled: deepEnabled,
        tier: entitlements.effectiveTier,
        reason: !deepEnabled && depth === "deep" ? "upgrade_required" : undefined,
      },
    })

    // Only cache live provider results — benchmark fallbacks stay uncached so
    // the next request retries real research.
    const liveResult =
      report.providerStatus.selected === "gemini" &&
      !report.providerStatus.unavailableReason &&
      report.findings.length > 0
    if (deepAllowed && admin && liveResult) {
      await writeCachedReport(admin, cacheKey, report)
    }

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
