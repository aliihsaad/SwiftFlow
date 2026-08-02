export type ContentPlatform = "instagram" | "facebook"
export type IntelligenceConfidence = "high" | "medium" | "low"
export type EvidenceFreshness = "live" | "last_24h" | "last_7d" | "last_30d" | "historical" | "unknown"

export type EvidenceSourceType =
  | "meta_insights"
  | "internal_analytics"
  | "brand_profile"
  | "grounded_web"
  | "trend_provider"
  | "benchmark"
  | "ai_inference"
  | "fallback"

export type ResearchProviderId =
  | "openrouter"
  | "gemini"
  | "openai"
  | "dataforseo"
  | "serpapi"
  | "google_trends"
  | "social_intelligence"
  | "benchmark"

export type SourceQualityTier = "primary" | "reputable" | "mixed" | "low"

export interface IntelligenceEvidence {
  sourceType: EvidenceSourceType
  provider?: ResearchProviderId | "meta" | "internal"
  title: string
  url?: string
  observedAt: string
  freshness: EvidenceFreshness
  confidence: IntelligenceConfidence
  summary: string
  metricBasis?: {
    metric: string
    value: number | string
    sampleSize?: number
  }
}

export interface BrandSignal {
  businessName: string | null
  industry: string | null
  targetAudience: string | null
  brandVoice: string | null
  language: string | null
  contentThemes: string[]
  services: string[]
  uniqueSellingPoints: string[]
}

export interface HistoricalPostSignal {
  id: string
  platform: ContentPlatform
  caption: string
  publishedAt: string | null
  likes: number
  comments: number
  shares: number
  views: number
  saves: number
  score: number
  hashtags: string[]
}

export interface HashtagPerformanceSignal {
  tag: string
  uses: number
  averageScore: number
  bestScore: number
}

export interface HourlyPerformanceSignal {
  platform: ContentPlatform
  dayOfWeek: number
  hour: number
  posts: number
  averageScore: number
}

export interface ContentIntelligenceSignals {
  brand: BrandSignal | null
  history: {
    totalPublishedPosts: number
    topPosts: HistoricalPostSignal[]
    hashtagPerformance: HashtagPerformanceSignal[]
    hourlyPerformance: HourlyPerformanceSignal[]
  }
  capabilities: {
    hasMetaInsights: boolean
    hasFacebookEngagement: boolean
  }
}

export interface ResearchFinding {
  title: string
  summary: string
  url?: string
  provider?: ResearchProviderId
  publishedAt?: string
  confidence: IntelligenceConfidence
  sourceQuality?: SourceQuality
}

export interface SourceQuality {
  score: number
  tier: SourceQualityTier
  reasons: string[]
  checkedAt: string
}

export interface TrendReportGating {
  allowed: boolean
  tier: string
  requiredTier?: "pro" | "business"
  reason?: "billing_not_live" | "upgrade_required" | "allowed"
}

export interface TrendReportResult {
  topic: string
  platform: ContentPlatform | "all"
  depth: "standard" | "deep"
  findings: ResearchFinding[]
  evidence: IntelligenceEvidence[]
  providerStatus: {
    selected: ResearchProviderId
    configured: boolean
    unavailableReason?: string
  }
  gating: TrendReportGating
  generatedAt: string
}

export type AnalyticsInsightKind = "what_is_working" | "growth" | "risk"
export type AnalyticsPatternType = "topic" | "format" | "time" | "caption" | "hashtag"

export interface AnalyticsInsightCard {
  id: string
  kind: AnalyticsInsightKind
  title: string
  summary: string
  confidence: IntelligenceConfidence
  metricLabel?: string
  metricValue?: string
  evidence: IntelligenceEvidence[]
}

export interface AnalyticsPatternCard {
  id: string
  type: AnalyticsPatternType
  title: string
  value: string
  summary: string
  confidence: IntelligenceConfidence
  evidence: IntelligenceEvidence[]
}

export interface AnalyticsExperiment {
  id: string
  title: string
  description: string
  confidence: IntelligenceConfidence
  evidence: IntelligenceEvidence[]
}

export interface AnalyticsInsightsResult {
  whatIsWorking: AnalyticsInsightCard[]
  whatToTryNext: AnalyticsExperiment[]
  patterns: AnalyticsPatternCard[]
  growthInsights: AnalyticsInsightCard[]
  evidence: IntelligenceEvidence[]
  generatedAt: string
  fallbackLevel: "personalized" | "mixed" | "benchmark"
}
