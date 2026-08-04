/**
 * Instagram long-lived token refresh policy.
 *
 * Pure TypeScript with no Deno/Node APIs so the Edge Function and the Vitest
 * suite share the same candidate selection, failure classification, retry
 * scheduling, and response parsing logic.
 */

export const INSTAGRAM_REFRESH_URL = "https://graph.instagram.com/v25.0/refresh_access_token"

export type TokenHealth = "valid" | "expiring_soon" | "invalid"

export type RefreshOutcome =
  | "refreshed"
  | "skipped_not_due"
  | "skipped_expired"
  | "skipped_reconnect_required"
  | "skipped_leased"
  | "retry_scheduled"
  | "reconnect_required"
  | "deferred_too_new"
  | "error"

export type RefreshFailureCategory = "transient" | "permanent" | "too_new"

export type TokenRefreshAccount = {
  id: string
  workspace_id: string
  platform: string
  access_token: string | null
  token_expires_at: string | null
  metadata: Record<string, unknown> | null
  refresh_claim_token?: string | null
  refresh_claimed_at?: string | null
}

export type MetaRefreshResponse = {
  access_token: string
  token_type?: string
  expires_in: number
}

export type RefreshAttemptResult =
  | { kind: "success"; accessToken: string; expiresIn: number }
  | { kind: "too_new"; retryAfter: Date }
  | { kind: "transient"; category: string; retryAfter: Date }
  | { kind: "permanent"; category: string; reason: string }

export interface RefreshPolicyConfig {
  renewalWindowDays: number
  maxRetryAttempts: number
  baseRetryDelayMinutes: number
  maxRetryDelayHours: number
  jitter: boolean
}

export function defaultRefreshPolicyConfig(): RefreshPolicyConfig {
  return {
    renewalWindowDays: 14,
    maxRetryAttempts: 5,
    baseRetryDelayMinutes: 30,
    maxRetryDelayHours: 12,
    jitter: true,
  }
}

export function resolveRefreshPolicyConfig(input?: Partial<RefreshPolicyConfig>): RefreshPolicyConfig {
  const defaults = defaultRefreshPolicyConfig()
  return {
    renewalWindowDays: positiveNumber(input?.renewalWindowDays, defaults.renewalWindowDays),
    maxRetryAttempts: positiveNumber(input?.maxRetryAttempts, defaults.maxRetryAttempts),
    baseRetryDelayMinutes: positiveNumber(input?.baseRetryDelayMinutes, defaults.baseRetryDelayMinutes),
    maxRetryDelayHours: positiveNumber(input?.maxRetryDelayHours, defaults.maxRetryDelayHours),
    jitter: input?.jitter ?? defaults.jitter,
  }
}

function positiveNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function isInstagramTokenRefreshDue(
  account: TokenRefreshAccount,
  now: Date,
  config: RefreshPolicyConfig = defaultRefreshPolicyConfig(),
): boolean {
  if (account.platform !== "instagram") return false
  if (!account.access_token) return false
  const metadata = account.metadata || {}
  if (metadata.reconnect_required === true) return false
  if (metadata.token_health === "invalid") return false
  if (account.refresh_claim_token && !isLeaseStale(account.refresh_claimed_at, now, 30)) return false

  const nextRetry = parseIso(metadata.token_refresh_next_at as string | undefined)
  if (nextRetry && nextRetry > now) return false

  const expiresAt = parseIso(account.token_expires_at)
  if (!expiresAt) return false
  if (expiresAt <= now) return false

  const windowStart = new Date(expiresAt.getTime() - config.renewalWindowDays * 24 * 60 * 60 * 1000)
  return now >= windowStart
}

function isLeaseStale(claimedAt: string | null | undefined, now: Date, staleAfterMinutes: number): boolean {
  const date = parseIso(claimedAt)
  if (!date) return true
  return now.getTime() - date.getTime() >= staleAfterMinutes * 60 * 1000
}

function parseIso(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

export function buildInstagramRefreshUrl(accessToken: string): string {
  const url = new URL(INSTAGRAM_REFRESH_URL)
  url.searchParams.set("grant_type", "ig_refresh_token")
  url.searchParams.set("access_token", accessToken)
  return url.toString()
}

export function parseMetaRefreshResponse(body: unknown): MetaRefreshResponse {
  if (!body || typeof body !== "object") {
    throw new Error("invalid_refresh_response")
  }
  const record = body as Record<string, unknown>
  const accessToken = typeof record.access_token === "string" ? record.access_token : ""
  const expiresIn = typeof record.expires_in === "number" ? record.expires_in : Number(record.expires_in)

  if (!accessToken) {
    throw new Error("missing_access_token")
  }
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("invalid_expires_in")
  }
  return {
    access_token: accessToken,
    token_type: typeof record.token_type === "string" ? record.token_type : undefined,
    expires_in: expiresIn,
  }
}

export function extractMetaGraphError(
  body: unknown,
): { message?: string; code?: number; error_subcode?: number; type?: string } | null {
  if (!body || typeof body !== "object") return null
  const record = body as Record<string, unknown>
  const error = record.error
  if (!error || typeof error !== "object") return null
  const e = error as Record<string, unknown>
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    code: typeof e.code === "number" ? e.code : Number(e.code) || undefined,
    error_subcode: typeof e.error_subcode === "number" ? e.error_subcode : Number(e.error_subcode) || undefined,
    type: typeof e.type === "string" ? e.type : undefined,
  }
}



function safeLower(value: string | undefined): string {
  return (value || "").toLowerCase()
}

export function classifyInstagramRefreshFailure(
  httpStatus: number,
  body: unknown,
): { category: RefreshFailureCategory; categoryCode: string; reason?: string; retryAfter?: Date } {
  const graphError = extractMetaGraphError(body)
  const message = safeLower(graphError?.message)
  const code = graphError?.code || 0
  const subcode = graphError?.error_subcode || 0

  if (
    message.includes("too new") ||
    message.includes("cannot be refreshed") ||
    message.includes("not valid yet") ||
    message.includes("refresh too soon") ||
    subcode === 2218002
  ) {
    return {
      category: "too_new",
      categoryCode: "token_too_new",
      retryAfter: new Date(Date.now() + 30 * 60 * 1000),
    }
  }

  const permanentReasons = [
    "expired",
    "revoked",
    "invalid token",
    "invalid oauth",
    "access token invalid",
    "session has expired",
    "session expired",
    "authorization",
    "not authorized",
    "token invalid",
  ]
  if (
    code === 190 ||
    code === 102 ||
    code === 104 ||
    (httpStatus === 400 && permanentReasons.some((phrase) => message.includes(phrase))) ||
    httpStatus === 401 ||
    (httpStatus === 403 && !message.includes("rate"))
  ) {
    return {
      category: "permanent",
      categoryCode: "token_expired_or_revoked",
      reason: "token_expired_or_revoked",
    }
  }

  if (
    httpStatus === 429 ||
    code === 4 ||
    code === 80000 ||
    message.includes("rate limit") ||
    message.includes("request limit")
  ) {
    return { category: "transient", categoryCode: "rate_limited" }
  }

  if (httpStatus >= 500 || httpStatus === 408 || code === 2 || code === 3) {
    return { category: "transient", categoryCode: "provider_transient_error" }
  }

  return { category: "transient", categoryCode: "transient_refresh_failure" }
}

export function calculateRetryAfter(
  attemptCount: number,
  now: Date,
  config: RefreshPolicyConfig,
  floorMinutes = 0,
): Date {
  const boundedAttempts = Math.max(0, Math.min(attemptCount, 10))
  let delayMinutes = config.baseRetryDelayMinutes * 2 ** boundedAttempts
  if (config.jitter) {
    delayMinutes *= 0.5 + Math.random() * 0.5
  }
  delayMinutes = Math.max(floorMinutes, delayMinutes)
  delayMinutes = Math.min(delayMinutes, config.maxRetryDelayHours * 60)
  return new Date(now.getTime() + Math.round(delayMinutes * 60 * 1000))
}
