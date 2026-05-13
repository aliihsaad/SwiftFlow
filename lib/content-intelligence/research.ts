import { fallbackEvidence } from "./evidence"
import type {
  ContentPlatform,
  EvidenceFreshness,
  IntelligenceConfidence,
  IntelligenceEvidence,
  ResearchFinding,
  ResearchProviderId,
  SourceQuality,
  SourceQualityTier,
  TrendReportGating,
  TrendReportResult,
} from "./types"

export interface ResearchProviderAdapter {
  id: ResearchProviderId
  label: string
  isConfigured: () => boolean
  search: (request: ResearchRequest) => Promise<ProviderResearchFinding[]>
}

export interface ProviderResearchFinding {
  title: string
  summary: string
  url?: string
  provider: ResearchProviderId
  confidence?: IntelligenceConfidence
  publishedAt?: string
}

export interface ResearchRequest {
  workspaceId: string
  topic: string
  platform?: ContentPlatform | "all"
  provider?: ResearchProviderId | "auto"
  adapters?: Partial<Record<ResearchProviderId, ResearchProviderAdapter>>
}

export interface ResearchResult {
  findings: ResearchFinding[]
  evidence: IntelligenceEvidence[]
  unavailableReason?: string
  providerStatus: {
    selected: ResearchProviderId
    configured: boolean
    unavailableReason?: string
  }
}

export interface TrendReportRequest extends ResearchRequest {
  depth?: "standard" | "deep"
  entitlement?: {
    enabled: boolean
    tier: string
    reason?: TrendReportGating["reason"]
  }
}

interface SourceQualityInput {
  url?: string
  title?: string
  publishedAt?: string
}

const PROVIDER_PRIORITY: ResearchProviderId[] = [
  "dataforseo",
  "serpapi",
  "google_trends",
  "openrouter",
  "gemini",
  "openai",
  "social_intelligence",
  "benchmark",
]

const PRIMARY_SOURCE_DOMAINS = [
  "about.instagram.com",
  "business.instagram.com",
  "developers.facebook.com",
  "facebook.com/business",
  "google.com",
  "trends.google.com",
  "dataforseo.com",
  "serpapi.com",
  "mckinsey.com",
  "pewresearch.org",
  "statista.com",
]

const REPUTABLE_SOURCE_DOMAINS = [
  "sproutsocial.com",
  "hootsuite.com",
  "later.com",
  "socialinsider.io",
  "buffer.com",
  "hubspot.com",
  "semrush.com",
]

const LOW_QUALITY_DOMAIN_HINTS = ["social-feed", "forum", "thread", "example", "localhost"]

function hasEnv(name: string): boolean {
  return typeof process !== "undefined" && Boolean(process.env?.[name]?.trim())
}

function hostFromUrl(url?: string): string {
  if (!url) return ""
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return ""
  }
}

function domainMatches(host: string, domains: string[]): boolean {
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`) || host.includes(domain))
}

function freshnessFromPublishedAt(publishedAt?: string): EvidenceFreshness {
  if (!publishedAt) return "unknown"
  const published = Date.parse(publishedAt)
  if (!Number.isFinite(published)) return "unknown"
  const ageMs = Date.now() - published
  const dayMs = 24 * 60 * 60 * 1000
  if (ageMs <= dayMs) return "last_24h"
  if (ageMs <= 7 * dayMs) return "last_7d"
  if (ageMs <= 30 * dayMs) return "last_30d"
  return "historical"
}

function tierFromScore(score: number): SourceQualityTier {
  if (score >= 80) return "primary"
  if (score >= 65) return "reputable"
  if (score >= 45) return "mixed"
  return "low"
}

function dormantAdapter(
  id: ResearchProviderId,
  label: string,
  isConfigured: () => boolean,
): ResearchProviderAdapter {
  return {
    id,
    label,
    isConfigured,
    search: async () => [],
  }
}

export function assessResearchSourceQuality(source: SourceQualityInput): SourceQuality {
  const host = hostFromUrl(source.url)
  const title = (source.title || "").toLowerCase()
  const reasons: string[] = []
  let score = source.url ? 35 : 20

  if (domainMatches(host, PRIMARY_SOURCE_DOMAINS)) {
    score += 45
    reasons.push("primary_or_original_source")
  } else if (domainMatches(host, REPUTABLE_SOURCE_DOMAINS)) {
    score += 30
    reasons.push("recognized_industry_source")
  } else if (!host) {
    score -= 10
    reasons.push("missing_source_url")
  } else {
    reasons.push("unverified_domain")
  }

  if (LOW_QUALITY_DOMAIN_HINTS.some((hint) => host.includes(hint))) {
    score -= 20
    reasons.push("low_quality_domain_signal")
  }

  if (source.publishedAt) {
    const published = Date.parse(source.publishedAt)
    const ageDays = Number.isFinite(published) ? (Date.now() - published) / (24 * 60 * 60 * 1000) : Number.POSITIVE_INFINITY
    if (ageDays <= 30) {
      score += 15
      reasons.push("recent_source")
    } else if (ageDays <= 180) {
      score += 8
      reasons.push("moderately_recent_source")
    } else {
      score -= 15
      reasons.push("stale_source")
    }
  } else {
    reasons.push("unknown_publication_date")
  }

  if (title.includes("report") || title.includes("documentation") || title.includes("study")) {
    score += 5
    reasons.push("substantive_source_title")
  }

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)))
  return {
    score: normalizedScore,
    tier: tierFromScore(normalizedScore),
    reasons,
    checkedAt: new Date().toISOString(),
  }
}

export function createDefaultResearchAdapters(): Record<ResearchProviderId, ResearchProviderAdapter> {
  return {
    dataforseo: dormantAdapter(
      "dataforseo",
      "DataForSEO",
      () => hasEnv("DATAFORSEO_API_KEY") || (hasEnv("DATAFORSEO_LOGIN") && hasEnv("DATAFORSEO_PASSWORD")),
    ),
    serpapi: dormantAdapter("serpapi", "SerpApi", () => hasEnv("SERPAPI_API_KEY")),
    google_trends: dormantAdapter("google_trends", "Google Trends", () => hasEnv("GOOGLE_TRENDS_API_KEY")),
    openrouter: dormantAdapter("openrouter", "OpenRouter", () => hasEnv("OPENROUTER_API_KEY")),
    gemini: dormantAdapter("gemini", "Gemini", () => hasEnv("GEMINI_API_KEY")),
    openai: dormantAdapter("openai", "OpenAI", () => hasEnv("OPENAI_API_KEY")),
    social_intelligence: dormantAdapter("social_intelligence", "Social intelligence", () => hasEnv("SOCIAL_INTELLIGENCE_API_KEY")),
    benchmark: {
      id: "benchmark",
      label: "Benchmark fallback",
      isConfigured: () => true,
      search: async () => [],
    },
  }
}

function mergeAdapters(
  overrides?: Partial<Record<ResearchProviderId, ResearchProviderAdapter>>,
): Record<ResearchProviderId, ResearchProviderAdapter> {
  return { ...createDefaultResearchAdapters(), ...(overrides || {}) }
}

function selectAdapter(
  adapters: Record<ResearchProviderId, ResearchProviderAdapter>,
  requested?: ResearchProviderId | "auto",
): ResearchProviderAdapter {
  if (requested && requested !== "auto") return adapters[requested]
  return PROVIDER_PRIORITY.map((provider) => adapters[provider]).find((adapter) => adapter.isConfigured()) || adapters.benchmark
}

function confidenceForQuality(quality: SourceQuality): IntelligenceConfidence {
  if (quality.score >= 80) return "high"
  if (quality.score >= 55) return "medium"
  return "low"
}

function evidenceForFinding(finding: ResearchFinding, adapter: ResearchProviderAdapter): IntelligenceEvidence {
  const quality = finding.sourceQuality
  const qualitySummary = quality ? ` Source quality: ${quality.tier} (${quality.score}/100).` : ""
  return {
    sourceType: finding.provider === "benchmark" ? "benchmark" : "trend_provider",
    provider: finding.provider || adapter.id,
    title: `${adapter.label} research source`,
    url: finding.url,
    observedAt: new Date().toISOString(),
    freshness: freshnessFromPublishedAt(finding.publishedAt),
    confidence: finding.confidence,
    summary: `${finding.title}: ${finding.summary}${qualitySummary}`,
    metricBasis: quality ? { metric: "source_quality", value: quality.score } : undefined,
  }
}

function providerUnavailableEvidence(topic: string, adapter: ResearchProviderAdapter, reason: string): IntelligenceEvidence {
  return fallbackEvidence(
    `Live trend research for "${topic}" through ${adapter.label} is unavailable: ${reason}.`,
    "low",
  )
}

function normalizeFindings(
  rawFindings: ProviderResearchFinding[],
  adapter: ResearchProviderAdapter,
): ResearchFinding[] {
  return rawFindings.slice(0, 8).map((finding) => {
    const sourceQuality = assessResearchSourceQuality(finding)
    return {
      title: finding.title,
      summary: finding.summary,
      url: finding.url,
      provider: finding.provider || adapter.id,
      publishedAt: finding.publishedAt,
      confidence: finding.confidence || confidenceForQuality(sourceQuality),
      sourceQuality,
    }
  })
}

function resolveGate(depth: "standard" | "deep", entitlement?: TrendReportRequest["entitlement"]): TrendReportGating {
  const tier = entitlement?.tier || "free"
  const paid = entitlement?.enabled && tier !== "free"
  if (depth === "deep" && !paid) {
    return {
      allowed: false,
      tier,
      requiredTier: "pro",
      reason: entitlement?.reason || "upgrade_required",
    }
  }
  return {
    allowed: true,
    tier,
    reason: "allowed",
  }
}

export async function researchContentTopic(request: ResearchRequest): Promise<ResearchResult> {
  const adapters = mergeAdapters(request.adapters)
  const adapter = selectAdapter(adapters, request.provider)

  if (!adapter.isConfigured()) {
    const unavailableReason = "research_provider_not_configured"
    return {
      findings: [],
      evidence: [providerUnavailableEvidence(request.topic, adapter, unavailableReason)],
      unavailableReason,
      providerStatus: {
        selected: adapter.id,
        configured: false,
        unavailableReason,
      },
    }
  }

  const findings = normalizeFindings(await adapter.search(request), adapter)
  if (findings.length === 0) {
    const unavailableReason = adapter.id === "benchmark" ? "research_provider_not_configured" : "provider_adapter_dormant"
    return {
      findings: [],
      evidence: [providerUnavailableEvidence(request.topic, adapter, unavailableReason)],
      unavailableReason,
      providerStatus: {
        selected: adapter.id,
        configured: adapter.id !== "benchmark" && adapter.isConfigured(),
        unavailableReason,
      },
    }
  }

  return {
    findings,
    evidence: findings.map((finding) => evidenceForFinding(finding, adapter)),
    providerStatus: {
      selected: adapter.id,
      configured: true,
    },
  }
}

export async function buildTrendReport(request: TrendReportRequest): Promise<TrendReportResult> {
  const depth = request.depth || "standard"
  const platform = request.platform || "all"
  const gating = resolveGate(depth, request.entitlement)
  const selected = request.provider && request.provider !== "auto" ? request.provider : "dataforseo"

  if (!gating.allowed) {
    return {
      topic: request.topic,
      platform,
      depth,
      findings: [],
      evidence: [
        fallbackEvidence(
          "Deep trend reports are reserved for paid plans. Billing entitlements are not live yet, so this report is locked without making external provider calls.",
          "low",
        ),
      ],
      providerStatus: {
        selected,
        configured: false,
        unavailableReason: gating.reason,
      },
      gating,
      generatedAt: new Date().toISOString(),
    }
  }

  const research = await researchContentTopic(request)
  return {
    topic: request.topic,
    platform,
    depth,
    findings: research.findings,
    evidence: research.evidence,
    providerStatus: research.providerStatus,
    gating,
    generatedAt: new Date().toISOString(),
  }
}
