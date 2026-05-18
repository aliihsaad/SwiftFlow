import { NextRequest, NextResponse } from "next/server"
import { loadContentIntelligenceSignals } from "@/app/api/content-intelligence/_shared"
import { maybeSyncWorkspaceAnalytics } from "@/lib/analytics/read-through-sync"
import { recommendHashtags } from "@/lib/content-intelligence/hashtags"
import { scorePostStrength } from "@/lib/content-intelligence/scoring"
import { recommendSlots } from "@/lib/content-intelligence/timing"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"
import type { ContentPlatform, PostIntelligenceInput, PostIntelligenceResult } from "@/lib/content-intelligence/types"

export const runtime = "nodejs"
export const maxDuration = 60

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
  return withDeveloperApiAuth(
    request,
    {
      requiredScopes: ["content_intelligence:run"],
      rateLimit: "content_intelligence",
      action: "content_intelligence.analyze_post",
      route: "/api/developer/v1/content-intelligence/analyze-post",
    },
    async (context) => {
      const body = await request.json().catch(() => ({}))
      const input: PostIntelligenceInput = {
        workspaceId: context.workspaceId,
        caption: String(body?.caption || "").slice(0, 5000),
        platforms: normalizePlatforms(body?.platforms),
        mediaUrls: normalizeMediaUrls(body?.mediaUrls),
        scheduledAt: typeof body?.scheduledAt === "string" ? body.scheduledAt : null,
      }

      await maybeSyncWorkspaceAnalytics({ workspaceId: context.workspaceId })

      const signals = await loadContentIntelligenceSignals(context.workspaceId)
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
    },
  )
}
