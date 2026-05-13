import type { IntelligenceConfidence, IntelligenceEvidence } from "./types"

export function fallbackEvidence(summary: string, confidence: IntelligenceConfidence = "low"): IntelligenceEvidence {
  return {
    sourceType: "fallback",
    provider: "benchmark",
    title: "Benchmark fallback",
    observedAt: new Date().toISOString(),
    freshness: "unknown",
    confidence,
    summary,
  }
}

export function internalEvidence(summary: string, sampleSize?: number): IntelligenceEvidence {
  return {
    sourceType: "internal_analytics",
    provider: "internal",
    title: "Workspace analytics",
    observedAt: new Date().toISOString(),
    freshness: "historical",
    confidence: sampleSize && sampleSize >= 10 ? "high" : sampleSize && sampleSize >= 3 ? "medium" : "low",
    summary,
    metricBasis: sampleSize ? { metric: "sample_size", value: sampleSize, sampleSize } : undefined,
  }
}

export function brandEvidence(summary: string): IntelligenceEvidence {
  return {
    sourceType: "brand_profile",
    provider: "internal",
    title: "Workspace brand profile",
    observedAt: new Date().toISOString(),
    freshness: "historical",
    confidence: "medium",
    summary,
  }
}
