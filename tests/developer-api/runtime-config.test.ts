import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { maxDuration as developerMcpMaxDuration } from "@/app/api/developer/mcp/route"
import { maxDuration as analyticsSummaryMaxDuration } from "@/app/api/developer/v1/analytics/summary/route"
import { maxDuration as contentIntelligenceAnalyzeMaxDuration } from "@/app/api/developer/v1/content-intelligence/analyze-post/route"
import { maxDuration as mediaGenerateMaxDuration } from "@/app/api/developer/v1/media/generate/route"

describe("developer API runtime configuration", () => {
  it("allows MCP image generation calls to run longer than the default API timeout", () => {
    expect(developerMcpMaxDuration).toBeGreaterThanOrEqual(120)
    expect(mediaGenerateMaxDuration).toBeGreaterThanOrEqual(120)
    expect(analyticsSummaryMaxDuration).toBeGreaterThanOrEqual(60)
    expect(contentIntelligenceAnalyzeMaxDuration).toBeGreaterThanOrEqual(60)

    const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      functions?: Record<string, { maxDuration?: number }>
    }

    expect(vercelConfig.functions?.["app/api/developer/mcp/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(120)
    expect(vercelConfig.functions?.["app/api/developer/v1/media/generate/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(120)
    expect(vercelConfig.functions?.["app/api/developer/v1/analytics/summary/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(60)
    expect(vercelConfig.functions?.["app/api/developer/v1/content-intelligence/analyze-post/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(60)
    expect(vercelConfig.functions?.["app/api/**"]?.maxDuration).toBe(30)
  })
})
