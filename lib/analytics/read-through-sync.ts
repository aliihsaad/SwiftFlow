import { createAdminClient } from "@/utils/supabase/admin"

export const ANALYTICS_READ_THROUGH_SYNC_TTL_MS = 15 * 60 * 1000

type SupabaseLikeClient = ReturnType<typeof createAdminClient>

export type AnalyticsReadThroughSyncResult = {
  attempted: boolean
  success: boolean
  skipped: boolean
  reason:
    | "fresh_cache"
    | "no_connected_accounts"
    | "missing_service_key"
    | "missing_supabase_url"
    | "sync_state_lookup_failed"
    | "synced"
    | "sync_failed"
  checkedAt: string
  staleAfterSeconds: number
  latestSyncedAt: string | null
  triggerReason?: "no_cached_published_posts" | "never_synced" | "stale_cache"
  status?: number
  error?: string
  result?: unknown
}

export function shouldRefreshAnalyticsCache(
  latestSyncedAt: string | null,
  now: Date = new Date(),
  ttlMs = ANALYTICS_READ_THROUGH_SYNC_TTL_MS,
): boolean {
  if (!latestSyncedAt) return true

  const syncedAtMs = new Date(latestSyncedAt).getTime()
  if (!Number.isFinite(syncedAtMs)) return true

  return now.getTime() - syncedAtMs >= ttlMs
}

async function parseSyncResponse(response: Response): Promise<unknown> {
  const raw = await response.text()
  if (!raw) return {}

  try {
    return JSON.parse(raw)
  } catch {
    return { error: raw }
  }
}

function readSyncError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error
    if (typeof error === "string" && error.trim().length > 0) return error
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message
      if (typeof message === "string" && message.trim().length > 0) return message
    }
  }

  return fallback
}

function baseResult(
  checkedAt: Date,
  ttlMs: number,
  latestSyncedAt: string | null,
): Pick<AnalyticsReadThroughSyncResult, "checkedAt" | "staleAfterSeconds" | "latestSyncedAt"> {
  return {
    checkedAt: checkedAt.toISOString(),
    staleAfterSeconds: Math.floor(ttlMs / 1000),
    latestSyncedAt,
  }
}

export async function maybeSyncWorkspaceAnalytics({
  workspaceId,
  accountIds,
  admin,
  now = new Date(),
  ttlMs = ANALYTICS_READ_THROUGH_SYNC_TTL_MS,
}: {
  workspaceId: string
  accountIds?: string[]
  admin?: SupabaseLikeClient
  now?: Date
  ttlMs?: number
}): Promise<AnalyticsReadThroughSyncResult> {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!admin && !serviceKey) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_service_key",
      ...baseResult(now, ttlMs, null),
    }
  }

  if (!admin && !supabaseUrl) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_supabase_url",
      ...baseResult(now, ttlMs, null),
    }
  }

  const client = admin || createAdminClient()

  let resolvedAccountIds = accountIds
  if (!resolvedAccountIds) {
    const { data, error } = await client
      .from("social_accounts")
      .select("id")
      .eq("workspace_id", workspaceId)

    if (error) {
      return {
        attempted: false,
        success: false,
        skipped: true,
        reason: "sync_state_lookup_failed",
        error: error.message,
        ...baseResult(now, ttlMs, null),
      }
    }

    resolvedAccountIds = (data || [])
      .map((account: { id?: unknown }) => account.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  }

  if (resolvedAccountIds.length === 0) {
    return {
      attempted: false,
      success: true,
      skipped: true,
      reason: "no_connected_accounts",
      ...baseResult(now, ttlMs, null),
    }
  }

  const { data: publishedPosts, error: publishedPostsError } = await client
    .from("published_posts")
    .select("id")
    .in("social_account_id", resolvedAccountIds)
    .limit(500)

  if (publishedPostsError) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "sync_state_lookup_failed",
      error: publishedPostsError.message,
      ...baseResult(now, ttlMs, null),
    }
  }

  const publishedPostIds = (publishedPosts || [])
    .map((post: { id?: unknown }) => post.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0)

  let latestSyncedAt: string | null = null
  let triggerReason: AnalyticsReadThroughSyncResult["triggerReason"] = "no_cached_published_posts"

  if (publishedPostIds.length > 0) {
    const { data: latestAnalytics, error: latestAnalyticsError } = await client
      .from("post_analytics")
      .select("synced_at")
      .in("published_post_id", publishedPostIds)
      .order("synced_at", { ascending: false })
      .limit(1)

    if (latestAnalyticsError) {
      return {
        attempted: false,
        success: false,
        skipped: true,
        reason: "sync_state_lookup_failed",
        error: latestAnalyticsError.message,
        ...baseResult(now, ttlMs, null),
      }
    }

    const rawLatestSyncedAt = latestAnalytics?.[0]?.synced_at
    latestSyncedAt = typeof rawLatestSyncedAt === "string" ? rawLatestSyncedAt : null
    triggerReason = latestSyncedAt ? "stale_cache" : "never_synced"

    if (!shouldRefreshAnalyticsCache(latestSyncedAt, now, ttlMs)) {
      return {
        attempted: false,
        success: true,
        skipped: true,
        reason: "fresh_cache",
        ...baseResult(now, ttlMs, latestSyncedAt),
      }
    }
  }

  if (!serviceKey) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_service_key",
      ...baseResult(now, ttlMs, latestSyncedAt),
    }
  }

  if (!supabaseUrl) {
    return {
      attempted: false,
      success: false,
      skipped: true,
      reason: "missing_supabase_url",
      ...baseResult(now, ttlMs, latestSyncedAt),
    }
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/sync-analytics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ workspaceId }),
    })
    const result = await parseSyncResponse(response)

    if (!response.ok) {
      return {
        attempted: true,
        success: false,
        skipped: false,
        reason: "sync_failed",
        triggerReason,
        status: response.status,
        error: readSyncError(result, response.statusText || "Analytics sync failed"),
        result,
        ...baseResult(now, ttlMs, latestSyncedAt),
      }
    }

    return {
      attempted: true,
      success: true,
      skipped: false,
      reason: "synced",
      triggerReason,
      status: response.status,
      result,
      ...baseResult(now, ttlMs, latestSyncedAt),
    }
  } catch (error) {
    return {
      attempted: true,
      success: false,
      skipped: false,
      reason: "sync_failed",
      triggerReason,
      error: error instanceof Error ? error.message : "Analytics sync failed",
      ...baseResult(now, ttlMs, latestSyncedAt),
    }
  }
}
