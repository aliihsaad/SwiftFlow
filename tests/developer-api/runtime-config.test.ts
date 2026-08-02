import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { maxDuration as developerMcpMaxDuration } from "@/app/api/developer/mcp/route"
import { maxDuration as analyticsSummaryMaxDuration } from "@/app/api/developer/v1/analytics/summary/route"

describe("developer API runtime configuration", () => {
  it("reserves longer runtimes for MCP and analytics refresh", () => {
    expect(developerMcpMaxDuration).toBeGreaterThanOrEqual(120)
    expect(analyticsSummaryMaxDuration).toBeGreaterThanOrEqual(60)

    const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      functions?: Record<string, { maxDuration?: number }>
    }

    expect(vercelConfig.functions?.["app/api/developer/mcp/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(120)
    expect(vercelConfig.functions?.["app/api/developer/v1/analytics/summary/route.ts"]?.maxDuration).toBeGreaterThanOrEqual(60)
    expect(vercelConfig.functions?.["app/api/**"]?.maxDuration).toBe(30)
  })
})
