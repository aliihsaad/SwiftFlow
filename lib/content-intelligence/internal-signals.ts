import type {
  BrandSignal,
  ContentIntelligenceSignals,
  ContentPlatform,
  HashtagPerformanceSignal,
  HistoricalPostSignal,
  HourlyPerformanceSignal,
} from "./types"

type UnknownRow = Record<string, unknown>

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function readNumber(value: unknown): number {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : []
}

function extractHashtags(caption: string): string[] {
  return Array.from(new Set((caption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.trim())))
}

function postScore(row: UnknownRow): number {
  return (
    readNumber(row.likes) +
    readNumber(row.comments) * 2 +
    readNumber(row.shares) * 3 +
    readNumber(row.saves) * 3 +
    Math.round(readNumber(row.views) / 100)
  )
}

function normalizeBrand(row: UnknownRow | null): BrandSignal | null {
  if (!row) return null

  const services = Array.isArray(row.services)
    ? row.services
      .map((service) => typeof service === "object" && service ? readString((service as UnknownRow).name) : null)
      .filter((value): value is string => Boolean(value))
    : []

  return {
    businessName: readString(row.business_name),
    industry: readString(row.industry),
    targetAudience: readString(row.target_audience),
    brandVoice: readString(row.brand_voice),
    language: readString(row.language),
    contentThemes: readStringArray(row.content_themes),
    services,
    uniqueSellingPoints: readStringArray(row.unique_selling_points),
  }
}

export function buildContentIntelligenceSignals(params: {
  brandProfile: UnknownRow | null
  publishedPosts: UnknownRow[]
  postAnalytics: UnknownRow[]
  socialAccounts: UnknownRow[]
}): ContentIntelligenceSignals {
  const analyticsByPublishedPost = new Map<string, UnknownRow>()
  for (const row of params.postAnalytics || []) {
    const publishedPostId = readString(row.published_post_id)
    if (publishedPostId) analyticsByPublishedPost.set(publishedPostId, row)
  }

  const historicalPosts: HistoricalPostSignal[] = (params.publishedPosts || [])
    .map((row) => {
      const id = readString(row.id) || ""
      const analytics = analyticsByPublishedPost.get(id) || {}
      const caption = readString(row.platform_caption) || readString(row.caption) || ""
      const score = postScore(analytics)

      return {
        id,
        platform: (row.platform === "facebook" ? "facebook" : "instagram") as ContentPlatform,
        caption,
        publishedAt: readString(row.published_at),
        likes: readNumber(analytics.likes),
        comments: readNumber(analytics.comments),
        shares: readNumber(analytics.shares),
        views: readNumber(analytics.views),
        saves: readNumber(analytics.saves),
        score,
        hashtags: extractHashtags(caption),
      }
    })
    .filter((post) => post.id)
    .sort((a, b) => b.score - a.score)

  const hashtagMap = new Map<string, { uses: number; total: number; best: number }>()
  for (const post of historicalPosts) {
    for (const tag of post.hashtags) {
      const existing = hashtagMap.get(tag) || { uses: 0, total: 0, best: 0 }
      existing.uses += 1
      existing.total += post.score
      existing.best = Math.max(existing.best, post.score)
      hashtagMap.set(tag, existing)
    }
  }

  const hashtagPerformance: HashtagPerformanceSignal[] = Array.from(hashtagMap.entries()).map(([tag, stats]) => ({
    tag,
    uses: stats.uses,
    averageScore: stats.uses > 0 ? stats.total / stats.uses : 0,
    bestScore: stats.best,
  }))

  const hourlyMap = new Map<string, { platform: ContentPlatform; dayOfWeek: number; hour: number; posts: number; total: number }>()
  for (const post of historicalPosts) {
    if (!post.publishedAt) continue
    const publishedAt = new Date(post.publishedAt)
    if (!Number.isFinite(publishedAt.getTime())) continue

    const key = `${post.platform}:${publishedAt.getUTCDay()}:${publishedAt.getUTCHours()}`
    const existing = hourlyMap.get(key) || {
      platform: post.platform,
      dayOfWeek: publishedAt.getUTCDay(),
      hour: publishedAt.getUTCHours(),
      posts: 0,
      total: 0,
    }
    existing.posts += 1
    existing.total += post.score
    hourlyMap.set(key, existing)
  }

  const hourlyPerformance: HourlyPerformanceSignal[] = Array.from(hourlyMap.values()).map((row) => ({
    platform: row.platform,
    dayOfWeek: row.dayOfWeek,
    hour: row.hour,
    posts: row.posts,
    averageScore: row.posts > 0 ? row.total / row.posts : 0,
  }))

  const grantedScopes = new Set<string>()
  for (const account of params.socialAccounts || []) {
    const metadata = typeof account.metadata === "object" && account.metadata ? account.metadata as UnknownRow : {}
    const scopes = readStringArray(metadata.granted_scopes)
    for (const scope of scopes) grantedScopes.add(scope)
  }

  return {
    brand: normalizeBrand(params.brandProfile),
    history: {
      totalPublishedPosts: historicalPosts.length,
      topPosts: historicalPosts.slice(0, 10),
      hashtagPerformance,
      hourlyPerformance,
    },
    capabilities: {
      hasMetaInsights: grantedScopes.has("instagram_manage_insights"),
      hasFacebookEngagement: grantedScopes.has("pages_read_engagement"),
    },
  }
}
