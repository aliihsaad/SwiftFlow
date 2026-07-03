import { describe, expect, it } from "vitest"
import {
  createGeminiResearchAdapter,
  parseGeminiResearchFindings,
} from "@/lib/content-intelligence/gemini-research"
import { buildTrendReport, researchContentTopic } from "@/lib/content-intelligence/research"

const paidEntitlement = { enabled: true, tier: "pro" as const }

describe("parseGeminiResearchFindings", () => {
  it("parses fenced JSON output and validates urls and dates", () => {
    const raw = [
      "```json",
      JSON.stringify([
        {
          title: "Reels under 30 seconds outperform",
          summary: "Short Reels drive higher completion rates in 2026 benchmarks.",
          url: "https://sproutsocial.com/insights/instagram-reels-report",
          publishedAt: "2026-06-20",
        },
        {
          title: "Bad url is dropped but finding survives",
          summary: "Finding with an invalid url keeps its content.",
          url: "not-a-url",
        },
        { title: "", summary: "missing title gets dropped entirely" },
      ]),
      "```",
    ].join("\n")

    const findings = parseGeminiResearchFindings(raw)
    expect(findings).toHaveLength(2)
    expect(findings[0].url).toContain("sproutsocial.com")
    expect(findings[0].publishedAt).toContain("2026-06-20")
    expect(findings[0].provider).toBe("gemini")
    expect(findings[1].url).toBeUndefined()
  })

  it("throws on non-JSON and on empty arrays", () => {
    expect(() => parseGeminiResearchFindings("I could not find anything.")).toThrow()
    expect(() => parseGeminiResearchFindings("[]")).toThrow()
    expect(() => parseGeminiResearchFindings('[{"title":"x"}]')).toThrow()
  })
})

describe("createGeminiResearchAdapter", () => {
  it("is unconfigured without an api key", () => {
    const adapter = createGeminiResearchAdapter({ apiKey: "" })
    expect(adapter.isConfigured()).toBe(false)
  })

  it("returns validated grounded findings through buildTrendReport", async () => {
    const adapter = createGeminiResearchAdapter({
      apiKey: "test-key",
      runSearch: async () =>
        JSON.stringify([
          {
            title: "Carousel posts regain reach",
            summary: "Multi-slide posts show a reach uplift for niche educators.",
            url: "https://later.com/blog/instagram-carousel-trends",
            publishedAt: "2026-06-28",
          },
        ]),
    })

    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "carousel trends",
      platform: "instagram",
      depth: "deep",
      entitlement: paidEntitlement,
      adapters: { gemini: adapter },
    })

    expect(report.gating.allowed).toBe(true)
    expect(report.providerStatus.selected).toBe("gemini")
    expect(report.providerStatus.unavailableReason).toBeUndefined()
    expect(report.findings).toHaveLength(1)
    expect(report.findings[0].provider).toBe("gemini")
    expect(report.findings[0].sourceQuality).toBeDefined()
  })

  it("falls back to benchmark findings when the provider errors", async () => {
    const adapter = createGeminiResearchAdapter({
      apiKey: "test-key",
      runSearch: async () => {
        throw new Error("quota exceeded")
      },
    })

    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "AI avatars",
      platform: "all",
      depth: "deep",
      entitlement: paidEntitlement,
      adapters: { gemini: adapter },
    })

    expect(report.providerStatus.selected).toBe("gemini")
    expect(report.providerStatus.unavailableReason).toBe("provider_error")
    expect(report.findings.length).toBeGreaterThan(0)
    expect(report.findings.every((finding) => finding.provider === "benchmark")).toBe(true)
  })

  it("falls back to benchmark findings when the provider output fails validation", async () => {
    const adapter = createGeminiResearchAdapter({
      apiKey: "test-key",
      runSearch: async () => "no JSON here, sorry",
    })

    const result = await researchContentTopic({
      workspaceId: "workspace-1",
      topic: "newsletter growth",
      adapters: { gemini: adapter },
    })

    expect(result.unavailableReason).toBe("provider_error")
    expect(result.findings.length).toBeGreaterThan(0)
    expect(result.findings.every((finding) => finding.provider === "benchmark")).toBe(true)
  })

  it("times out slow provider calls and falls back to benchmark", async () => {
    const adapter = createGeminiResearchAdapter({
      apiKey: "test-key",
      timeoutMs: 20,
      runSearch: () => new Promise((resolve) => setTimeout(() => resolve("[]"), 200)),
    })

    const report = await buildTrendReport({
      workspaceId: "workspace-1",
      topic: "slow provider",
      depth: "deep",
      entitlement: paidEntitlement,
      adapters: { gemini: adapter },
    })

    expect(report.providerStatus.unavailableReason).toBe("provider_error")
    expect(report.findings.every((finding) => finding.provider === "benchmark")).toBe(true)
  })
})
