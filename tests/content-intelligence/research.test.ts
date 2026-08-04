import { describe, expect, it } from "vitest"
import { assessResearchSourceQuality, buildTrendReport, researchContentTopic } from "@/lib/content-intelligence/research"

describe("content intelligence research", () => {
  it("scores primary recent sources higher than low-quality social-only sources", () => {
    const primary = assessResearchSourceQuality({
      url: "https://business.instagram.com/",
      title: "Instagram Platform documentation",
      publishedAt: "2026-05-12T00:00:00.000Z",
    })
    const weak = assessResearchSourceQuality({
      url: "https://example-social-feed.test/post/123",
      title: "viral post",
      publishedAt: "2024-01-01T00:00:00.000Z",
    })

    expect(primary.score).toBeGreaterThan(weak.score)
    expect(primary.tier).toBe("primary")
    expect(weak.tier).toBe("low")
  })

  it("returns an explicit paid-plan gate for deep reports when entitlements are unavailable", async () => {
    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "AI coding assistants",
      platform: "instagram",
      depth: "deep",
      entitlement: { enabled: false, tier: "free", reason: "billing_not_live" },
    })

    expect(report.gating.allowed).toBe(false)
    expect(report.gating.requiredTier).toBe("pro")
    expect(report.findings).toEqual([])
  })

  it("normalizes injected provider findings with source quality evidence", async () => {
    const result = await researchContentTopic({
      workspaceId: "workspace-1",
      topic: "AI agents",
      provider: "dataforseo",
      adapters: {
        dataforseo: {
          id: "dataforseo",
          label: "DataForSEO",
          isConfigured: () => true,
          search: async () => [
            {
              title: "AI agent adoption report",
              summary: "A recent report covers AI agent adoption.",
              url: "https://www.mckinsey.com/capabilities/quantumblack/our-insights",
              provider: "dataforseo",
              publishedAt: "2026-05-01T00:00:00.000Z",
            },
          ],
        },
      },
    })

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].sourceQuality?.tier).toBe("primary")
    expect(result.evidence[0].sourceType).toBe("trend_provider")
  })

  it("falls back to benchmark guidance when auto research providers are not live", async () => {
    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "Claude Code",
      platform: "all",
      depth: "standard",
    })

    expect(report.gating.allowed).toBe(true)
    expect(report.providerStatus.selected).toBe("benchmark")
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings[0].summary).toContain("Claude Code")
  })
})
