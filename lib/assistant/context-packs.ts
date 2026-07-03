import type { AssistantAction, AssistantMode } from "@/app/dashboard/assistant/assistant-types"
import {
  ANALYTICS_READ_THROUGH_SYNC_TTL_MS,
  maybeSyncWorkspaceAnalytics,
} from "@/lib/analytics/read-through-sync"
import { createAdminClient } from "@/utils/supabase/admin"
import { contextKindsForIntent } from "./context-selection"
import type {
  AssistantAccountContextItem,
  AssistantAnalyticsContext,
  AssistantAutomationContextItem,
  AssistantBrandContext,
  AssistantContextPack,
  AssistantPostContextItem,
  AssistantSelectedContext,
} from "./context-types"

type SupabaseAdmin = ReturnType<typeof createAdminClient>

function text(value: unknown, fallback = "", max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback
}

function stringList(value: unknown, maxItems = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, "", 140)).filter(Boolean).slice(0, maxItems)
    : []
}

function numberValue(value: unknown): number {
  const number = Number(value || 0)
  return Number.isFinite(number) ? number : 0
}

function platformList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, "", 40)).filter(Boolean)
    : []
}

function readCapabilities(metadata: unknown): AssistantAccountContextItem["capabilities"] {
  const record = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {}
  const capabilities = record.capabilities && typeof record.capabilities === "object"
    ? record.capabilities as Record<string, unknown>
    : record

  return {
    analyticsRead: capabilities.analytics_read === true,
    comments: capabilities.comments === true || capabilities.comment_reply === true,
    messages: capabilities.messages === true || capabilities.dm_reply === true,
    publishing: capabilities.publishing === true || capabilities.content_publish === true,
  }
}

async function buildBrandContext(admin: SupabaseAdmin, workspaceId: string): Promise<AssistantBrandContext | undefined> {
  const { data, error } = await admin
    .from("workspace_brand_profiles")
    .select("business_name, industry, brand_voice, language, target_audience, business_description, services, unique_selling_points, content_themes, brand_colors")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (error || !data) return undefined

  return {
    businessName: text(data.business_name, "", 160),
    industry: text(data.industry, "", 160),
    brandVoice: text(data.brand_voice, "professional", 80),
    language: text(data.language, "en", 20),
    targetAudience: text(data.target_audience, "", 500),
    businessDescription: text(data.business_description, "", 700),
    services: stringList(data.services, 12),
    uniqueSellingPoints: stringList(data.unique_selling_points, 8),
    contentThemes: stringList(data.content_themes, 15),
    brandColors: data.brand_colors && typeof data.brand_colors === "object"
      ? data.brand_colors as AssistantBrandContext["brandColors"]
      : undefined,
  }
}

async function buildAccountContext(admin: SupabaseAdmin, workspaceId: string) {
  const { data, error } = await admin
    .from("social_accounts")
    .select("id, platform, account_name, account_id, metadata")
    .eq("workspace_id", workspaceId)
    .in("platform", ["instagram", "facebook"])
    .order("platform", { ascending: true })
    .limit(20)

  if (error) return { connectedCount: 0, items: [] as AssistantAccountContextItem[] }

  const items = (data || []).map((account: Record<string, unknown>) => ({
    id: text(account.id, "", 80),
    platform: account.platform === "facebook" ? "facebook" as const : "instagram" as const,
    accountName: text(account.account_name, "", 160),
    accountId: text(account.account_id, "", 120),
    connected: true,
    capabilities: readCapabilities(account.metadata),
  }))

  return { connectedCount: items.length, items }
}

async function buildContentContext(
  admin: SupabaseAdmin,
  workspaceId: string,
  selectedContext?: AssistantSelectedContext,
) {
  const { data } = await admin
    .from("posts")
    .select("id, content, media_urls, platforms, status, scheduled_for, published_at, updated_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(12)

  const recentPosts: AssistantPostContextItem[] = (data || []).map((post: Record<string, unknown>) => ({
    id: text(post.id, "", 80),
    status: text(post.status, "draft", 40),
    content: text(post.content, "", 700),
    platforms: platformList(post.platforms),
    mediaCount: Array.isArray(post.media_urls) ? post.media_urls.length : 0,
    scheduledFor: typeof post.scheduled_for === "string" ? post.scheduled_for : null,
    publishedAt: typeof post.published_at === "string" ? post.published_at : null,
    updatedAt: typeof post.updated_at === "string"
      ? post.updated_at
      : (typeof post.created_at === "string" ? post.created_at : null),
  }))

  const selectedId = selectedContext?.postId || selectedContext?.draftId
  const selectedPost = selectedId ? recentPosts.find((post) => post.id === selectedId) : undefined
  return { recentPosts, selectedPost }
}

async function buildAutomationContext(admin: SupabaseAdmin, workspaceId: string) {
  const { data } = await admin
    .from("automations")
    .select("id, name, type, is_active, total_triggered, total_dms_sent, updated_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(8)

  const items: AssistantAutomationContextItem[] = (data || []).map((automation: Record<string, unknown>) => ({
    id: text(automation.id, "", 80),
    name: text(automation.name, "Untitled automation", 160),
    type: text(automation.type, "", 80),
    isActive: automation.is_active === true,
    totalTriggered: numberValue(automation.total_triggered),
    totalDmsSent: numberValue(automation.total_dms_sent),
    updatedAt: typeof automation.updated_at === "string"
      ? automation.updated_at
      : (typeof automation.created_at === "string" ? automation.created_at : null),
  }))

  return { activeCount: items.filter((item) => item.isActive).length, items }
}

async function buildAnalyticsContext(
  admin: SupabaseAdmin,
  workspaceId: string,
  accountIds: string[],
  range: "7d" | "30d" | "90d",
  readThroughSync = true,
): Promise<AssistantAnalyticsContext> {
  const sync = readThroughSync
    ? await maybeSyncWorkspaceAnalytics({ workspaceId, accountIds, admin })
    : {
      attempted: false,
      success: true,
      skipped: true,
      reason: "fresh_cache" as const,
      checkedAt: new Date().toISOString(),
      staleAfterSeconds: Math.floor(ANALYTICS_READ_THROUGH_SYNC_TTL_MS / 1000),
      latestSyncedAt: null,
    }
  const { data: publishedPosts } = accountIds.length
    ? await admin
      .from("published_posts")
      .select("id, platform, published_at, social_account_id")
      .in("social_account_id", accountIds)
      .limit(500)
    : { data: [] }

  const publishedPostIds = (publishedPosts || []).map((post: { id: string }) => post.id)
  const { data: analyticsRows } = publishedPostIds.length
    ? await admin
      .from("post_analytics")
      .select("published_post_id, views, likes, comments, shares, saves, engagement_rate, synced_at")
      .in("published_post_id", publishedPostIds)
      .limit(500)
    : { data: [] }

  const publishedById = new Map((publishedPosts || []).map((post: Record<string, unknown>) => [post.id, post]))
  const rows = (analyticsRows || []) as Array<Record<string, unknown>>
  const topPosts = rows
    .map((row) => {
      const published = publishedById.get(row.published_post_id)
      const score = numberValue(row.views) +
        numberValue(row.likes) * 3 +
        numberValue(row.comments) * 5 +
        numberValue(row.shares) * 6 +
        numberValue(row.saves) * 4

      return {
        publishedPostId: text(row.published_post_id, "", 80),
        platform: text(published?.platform, "", 40),
        publishedAt: typeof published?.published_at === "string" ? published.published_at : null,
        views: numberValue(row.views),
        likes: numberValue(row.likes),
        comments: numberValue(row.comments),
        shares: numberValue(row.shares),
        saves: numberValue(row.saves),
        score,
      }
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)

  return {
    range,
    totals: {
      views: rows.reduce((total, row) => total + numberValue(row.views), 0),
      likes: rows.reduce((total, row) => total + numberValue(row.likes), 0),
      comments: rows.reduce((total, row) => total + numberValue(row.comments), 0),
      shares: rows.reduce((total, row) => total + numberValue(row.shares), 0),
      saves: rows.reduce((total, row) => total + numberValue(row.saves), 0),
      publishedPosts: publishedPostIds.length,
      connectedAccounts: accountIds.length,
    },
    topPosts,
    sync,
  }
}

export async function buildAssistantContext({
  workspaceId,
  mode,
  action,
  selectedContext,
  readThroughSync = true,
  admin = createAdminClient(),
}: {
  workspaceId: string
  mode: AssistantMode
  action: AssistantAction
  selectedContext?: AssistantSelectedContext
  readThroughSync?: boolean
  admin?: SupabaseAdmin
}): Promise<AssistantContextPack> {
  const requestedKinds = contextKindsForIntent(mode, action)
  const warnings: string[] = []
  const context: AssistantContextPack = {
    requestedKinds,
    generatedAt: new Date().toISOString(),
    warnings,
  }

  if (requestedKinds.includes("brand")) {
    context.brand = await buildBrandContext(admin, workspaceId)
    if (!context.brand) warnings.push("Brand profile is not configured yet.")
  }

  if (requestedKinds.includes("accounts") || requestedKinds.includes("analytics")) {
    context.accounts = await buildAccountContext(admin, workspaceId)
    if (context.accounts.connectedCount === 0) warnings.push("No Instagram or Facebook accounts are connected.")
  }

  if (requestedKinds.includes("content")) {
    context.content = await buildContentContext(admin, workspaceId, selectedContext)
  }

  if (requestedKinds.includes("automations")) {
    context.automations = await buildAutomationContext(admin, workspaceId)
  }

  if (requestedKinds.includes("analytics")) {
    const accountIds = context.accounts?.items.map((account) => account.id) || []
    const range = selectedContext?.analyticsRange || "30d"
    context.analytics = await buildAnalyticsContext(admin, workspaceId, accountIds, range, readThroughSync)
    if (!context.analytics.sync.success) warnings.push("Analytics sync did not complete; cached analytics were used.")
  }

  return context
}
