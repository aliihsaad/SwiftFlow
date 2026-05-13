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

export interface IntelligenceEvidence {
  sourceType: EvidenceSourceType
  provider?: "openrouter" | "gemini" | "openai" | "meta" | "internal" | "benchmark"
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

export interface PostIntelligenceInput {
  workspaceId: string
  caption: string
  platforms: ContentPlatform[]
  mediaUrls: string[]
  scheduledAt: string | null
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

export type StrengthBand = "strong" | "good" | "needs_work" | "weak"

export interface StrengthFix {
  id: string
  title: string
  description: string
  impact: "high" | "medium" | "low"
}

export interface StrengthScore {
  score: number
  band: StrengthBand
  confidence: IntelligenceConfidence
  subScores: {
    hook: number
    brandFit: number
    platformFit: number
    hashtags: number
    timing: number
    trend: number
    similarity: number
    completeness: number
  }
  topFixes: StrengthFix[]
  evidence: IntelligenceEvidence[]
}

export interface HashtagRecommendation {
  tag: string
  score: number
  reason: string
  category: "niche" | "audience" | "topic" | "brand" | "trend"
  evidence: IntelligenceEvidence[]
}

export interface RecommendedSlot {
  startsAt: string
  platform: ContentPlatform | "all"
  score: number
  confidence: IntelligenceConfidence
  reason: string
  evidence: IntelligenceEvidence[]
}

export type SlotStrengthLabel = "strong" | "okay" | "weak"

export interface ResearchFinding {
  title: string
  summary: string
  url?: string
  provider?: "openrouter" | "gemini" | "openai" | "benchmark"
  confidence: IntelligenceConfidence
}

export interface PostIntelligenceResult {
  strength: StrengthScore
  hashtags: HashtagRecommendation[]
  slots: RecommendedSlot[]
  evidence: IntelligenceEvidence[]
  generatedAt: string
  fallbackLevel: "personalized" | "mixed" | "benchmark"
}
