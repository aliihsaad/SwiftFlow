/**
 * Instagram token refresh state transitions and metadata patching.
 *
 * Pure TypeScript with no Deno/Node APIs so the Edge Function and the Vitest
 * suite share the same metadata-update logic.
 */

import {
  type RefreshAttemptResult,
  type RefreshOutcome,
  type RefreshPolicyConfig,
  calculateRetryAfter,
  classifyInstagramRefreshFailure,
  parseMetaRefreshResponse,
} from "./instagram-token-refresh-policy.ts"

const ALERT_DEDUPE_HOURS = 24

export function classifyRefreshAttemptResult(
  result:
    | { ok: true; body: unknown }
    | { ok: false; httpStatus: number; body: unknown },
  config: RefreshPolicyConfig,
  now: Date,
): RefreshAttemptResult {
  if (!result.ok) {
    const failure = classifyInstagramRefreshFailure(result.httpStatus, result.body)
    if (failure.category === "too_new") {
      return { kind: "too_new", retryAfter: failure.retryAfter || calculateRetryAfter(0, now, config, 30) }
    }
    if (failure.category === "permanent") {
      return { kind: "permanent", category: failure.categoryCode, reason: failure.reason || failure.categoryCode }
    }
    return { kind: "transient", category: failure.categoryCode, retryAfter: calculateRetryAfter(0, now, config) }
  }

  try {
    const parsed = parseMetaRefreshResponse(result.body)
    return { kind: "success", accessToken: parsed.access_token, expiresIn: parsed.expires_in }
  } catch {
    return { kind: "transient", category: "invalid_refresh_response", retryAfter: calculateRetryAfter(0, now, config) }
  }
}

export function buildTokenRefreshMetadataPatch(input: {
  result: RefreshAttemptResult
  existingMetadata: Record<string, unknown>
  now: Date
  config: RefreshPolicyConfig
}): Record<string, unknown> {
  const { result, existingMetadata, now, config } = input
  const base = { ...existingMetadata }

  if (result.kind === "success") {
    const expiresAt = new Date(now.getTime() + result.expiresIn * 1000).toISOString()
    return {
      ...base,
      token_health: "valid",
      token_checked_at: now.toISOString(),
      token_refreshed_at: now.toISOString(),
      token_refresh_last_status: "succeeded",
      token_refresh_next_at: undefined,
      token_refresh_attempt_count: 0,
      token_refresh_last_error_code: undefined,
      token_refresh_last_error_at: undefined,
      reconnect_required: false,
      reconnect_reason: undefined,
      token_expires_at: expiresAt,
    }
  }

  if (result.kind === "too_new") {
    return {
      ...base,
      token_health: "valid",
      token_checked_at: now.toISOString(),
      token_refresh_last_status: "deferred_too_new",
      token_refresh_next_at: result.retryAfter.toISOString(),
    }
  }

  if (result.kind === "permanent") {
    return {
      ...base,
      token_health: "invalid",
      token_checked_at: now.toISOString(),
      token_refresh_last_status: "reconnect_required",
      reconnect_required: true,
      reconnect_reason: result.reason,
      token_refresh_next_at: undefined,
    }
  }

  const attemptCount = Math.max(0, Math.min(Number(base.token_refresh_attempt_count) || 0, 10)) + 1
  const retryAfter = calculateRetryAfter(attemptCount, now, config)

  return {
    ...base,
    token_checked_at: now.toISOString(),
    token_refresh_last_status: "retry_scheduled",
    token_refresh_last_error_code: result.category,
    token_refresh_last_error_at: now.toISOString(),
    token_refresh_attempt_count: attemptCount,
    token_refresh_next_at: retryAfter.toISOString(),
  }
}

export function outcomeFromResult(result: RefreshAttemptResult): RefreshOutcome {
  switch (result.kind) {
    case "success":
      return "refreshed"
    case "too_new":
      return "deferred_too_new"
    case "permanent":
      return "reconnect_required"
    case "transient":
      return "retry_scheduled"
  }
}

export type RefreshSummaryKey =
  | "refreshed"
  | "deferred_too_new"
  | "retry_scheduled"
  | "reconnect_required"
  | "skipped"
  | "errors"

export type RefreshRunSummary = Record<RefreshSummaryKey, number>

export function createRefreshRunSummary(): RefreshRunSummary {
  return {
    refreshed: 0,
    deferred_too_new: 0,
    retry_scheduled: 0,
    reconnect_required: 0,
    skipped: 0,
    errors: 0,
  }
}

/**
 * Maps an outcome to the summary counter it belongs to. Every outcome resolves
 * to a real key, so a run summary can never grow an ad-hoc field or report NaN.
 */
export function summaryKeyForOutcome(outcome: RefreshOutcome): RefreshSummaryKey {
  switch (outcome) {
    case "refreshed":
      return "refreshed"
    case "deferred_too_new":
      return "deferred_too_new"
    case "retry_scheduled":
      return "retry_scheduled"
    case "reconnect_required":
      return "reconnect_required"
    case "error":
      return "errors"
    default:
      // Every skipped_* variant rolls up into the single "skipped" counter.
      return "skipped"
  }
}

export function recordRefreshOutcome(summary: RefreshRunSummary, outcome: RefreshOutcome): RefreshRunSummary {
  const key = summaryKeyForOutcome(outcome)
  const current = summary[key]
  summary[key] = (Number.isFinite(current) ? current : 0) + 1
  return summary
}

/**
 * Decides whether this failure warrants a Telegram alert.
 *
 * `immediate` is set for permanent failures (revoked/expired token): the user
 * must reconnect, so the alert fires on the first occurrence instead of waiting
 * for retry escalation. The 24h dedupe window is checked first and applies to
 * immediate alerts too, so a permanently broken account alerts at most once a
 * day.
 */
export function shouldSendRefreshAlert(
  metadata: Record<string, unknown>,
  attemptCount: number,
  maxAttempts: number,
  now: Date = new Date(),
  immediate = false,
): boolean {
  const lastAlertAt = metadata.token_refresh_alert_sent_at
    ? new Date(String(metadata.token_refresh_alert_sent_at))
    : null
  const cutoff = new Date(now.getTime() - ALERT_DEDUPE_HOURS * 60 * 60 * 1000)
  if (lastAlertAt && !Number.isNaN(lastAlertAt.getTime()) && lastAlertAt > cutoff) return false
  if (immediate) return true
  if (attemptCount >= Math.max(1, Math.floor(maxAttempts / 2))) return true
  return false
}

export function sanitizeRefreshOutcomeForLogging(outcome: {
  accountId?: string
  workspaceId?: string
  outcome: RefreshOutcome
  categoryCode?: string
  durationMs: number
  attemptCount?: number
}): Record<string, unknown> {
  return {
    account_id: outcome.accountId ? shortId(outcome.accountId) : undefined,
    workspace_id: outcome.workspaceId ? shortId(outcome.workspaceId) : undefined,
    outcome: outcome.outcome,
    category_code: outcome.categoryCode,
    duration_ms: outcome.durationMs,
    attempt_count: outcome.attemptCount,
  }
}

function shortId(value: string): string {
  return value.length > 8 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value
}
