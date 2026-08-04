import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

import {
  buildInstagramRefreshUrl,
  classifyInstagramRefreshFailure,
  defaultRefreshPolicyConfig,
  isInstagramTokenRefreshDue,
  parseMetaRefreshResponse,
  resolveRefreshPolicyConfig,
} from "../../supabase/functions/_shared/instagram-token-refresh-policy.ts"
import {
  buildTokenRefreshMetadataPatch,
  classifyRefreshAttemptResult,
  createRefreshRunSummary,
  outcomeFromResult,
  recordRefreshOutcome,
  sanitizeRefreshOutcomeForLogging,
  shouldSendRefreshAlert,
  summaryKeyForOutcome,
} from "../../supabase/functions/_shared/instagram-token-refresh-state.ts"
import { refreshLongLivedInstagramToken } from "@/lib/instagram-onboarding"
import { sanitizeMetaAccountMetadataForClient, type MetaAccountMetadata } from "@/lib/meta-account"
import {
  deriveRenewalNotice,
  type ConnectedSocialAccount,
} from "@/lib/instagram-token-renewal-notice"

const NOW = new Date("2026-07-03T12:00:00Z")
const TOKEN = "IGAA-secret-token-that-must-never-appear-in-logs-or-responses"
const ACCOUNT_ID = "28929941546606289"

function future(days: number): string {
  return new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

function past(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

describe("Instagram token refresh candidate selection", () => {
  it("skips a valid token outside the renewal window", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: future(30),
      metadata: { token_health: "valid" },
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(false)
  })

  it("selects a valid token inside the renewal window", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: future(10),
      metadata: { token_health: "valid" },
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(true)
  })

  it("skips expired tokens", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: past(1),
      metadata: { token_health: "valid" },
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(false)
  })

  it("skips accounts flagged for reconnection", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: future(5),
      metadata: { reconnect_required: true },
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(false)
  })

  it("skips non-Instagram platforms", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "twitter",
      access_token: TOKEN,
      token_expires_at: future(5),
      metadata: {},
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(false)
  })

  it("respects active leases and allows stale leases", () => {
    const activeLease = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: future(5),
      metadata: {},
      refresh_claim_token: "claim-123",
      refresh_claimed_at: new Date(NOW.getTime() - 5 * 60 * 1000).toISOString(),
    }
    expect(isInstagramTokenRefreshDue(activeLease, NOW)).toBe(false)

    const staleLease = {
      ...activeLease,
      refresh_claimed_at: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
    }
    expect(isInstagramTokenRefreshDue(staleLease, NOW)).toBe(true)
  })

  it("respects token_refresh_next_at backoff", () => {
    const account = {
      id: ACCOUNT_ID,
      workspace_id: "workspace-1",
      platform: "instagram",
      access_token: TOKEN,
      token_expires_at: future(5),
      metadata: { token_refresh_next_at: future(2) },
    }
    expect(isInstagramTokenRefreshDue(account, NOW)).toBe(false)
  })
})


describe("Instagram refresh request/response handling", () => {
  it("builds the refresh URL without leaking the token into the path or using a secret", () => {
    const url = buildInstagramRefreshUrl(TOKEN)
    expect(url.startsWith("https://graph.instagram.com/v25.0/refresh_access_token?")).toBe(true)
    expect(url).toContain("grant_type=ig_refresh_token")
    expect(url).toContain(encodeURIComponent(TOKEN))
    expect(url).not.toContain("appsecret_proof")
    expect(url).not.toContain("client_secret")
  })

  it("accepts a valid refresh response", () => {
    const parsed = parseMetaRefreshResponse({
      access_token: TOKEN,
      token_type: "bearer",
      expires_in: 5_184_000,
    })
    expect(parsed.access_token).toBe(TOKEN)
    expect(parsed.expires_in).toBe(5_184_000)
  })

  it("rejects a response missing access_token", () => {
    expect(() => parseMetaRefreshResponse({ expires_in: 5_184_000 })).toThrow("missing_access_token")
  })

  it("rejects a response with invalid expires_in", () => {
    expect(() => parseMetaRefreshResponse({ access_token: TOKEN, expires_in: -1 })).toThrow("invalid_expires_in")
    expect(() => parseMetaRefreshResponse({ access_token: TOKEN })).toThrow("invalid_expires_in")
  })
})

describe("Instagram refresh failure classification", () => {
  it("classifies 429 as transient rate-limited", () => {
    const failure = classifyInstagramRefreshFailure(429, { error: { message: "Rate limit" } })
    expect(failure.category).toBe("transient")
    expect(failure.categoryCode).toBe("rate_limited")
  })

  it("classifies 5xx as transient provider error", () => {
    const failure = classifyInstagramRefreshFailure(503, { error: { message: "Service unavailable" } })
    expect(failure.category).toBe("transient")
    expect(failure.categoryCode).toBe("provider_transient_error")
  })

  it("classifies code 190 as permanent token expired or revoked", () => {
    const failure = classifyInstagramRefreshFailure(400, { error: { code: 190, message: "Access token expired" } })
    expect(failure.category).toBe("permanent")
    expect(failure.categoryCode).toBe("token_expired_or_revoked")
  })

  it("classifies revoked/invalid token messages as permanent", () => {
    for (const message of ["token has been revoked", "invalid oauth token", "session has expired"]) {
      const failure = classifyInstagramRefreshFailure(400, { error: { message } })
      expect(failure.category).toBe("permanent")
    }
  })

  it("classifies too-new token errors as deferred", () => {
    const failure = classifyInstagramRefreshFailure(400, { error: { message: "Token is too new to refresh" } })
    expect(failure.category).toBe("too_new")
    expect(failure.retryAfter).toBeInstanceOf(Date)
  })

  it("defaults unknown failures to transient so a working token is not destroyed", () => {
    const failure = classifyInstagramRefreshFailure(400, { error: { message: "Unknown weird error" } })
    expect(failure.category).toBe("transient")
  })
})


describe("Instagram refresh metadata patching", () => {
  const config = defaultRefreshPolicyConfig()

  it("stores new expiry and clears error state on success", () => {
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "success", accessToken: TOKEN, expiresIn: 5_184_000 },
      existingMetadata: { token_refresh_attempt_count: 2, reconnect_required: false },
      now: NOW,
      config,
    })
    expect(patch.token_health).toBe("valid")
    expect(patch.token_refreshed_at).toBe(NOW.toISOString())
    expect(patch.token_refresh_last_status).toBe("succeeded")
    expect(patch.token_refresh_attempt_count).toBe(0)
    expect(patch.token_expires_at).toBe(new Date(NOW.getTime() + 5_184_000 * 1000).toISOString())
    expect(patch.reconnect_required).toBe(false)
  })

  it("preserves existing metadata keys on success", () => {
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "success", accessToken: TOKEN, expiresIn: 5_184_000 },
      existingMetadata: { ig_username: "swiftflow", granted_scopes: ["instagram_business_basic"] },
      now: NOW,
      config,
    })
    expect(patch.ig_username).toBe("swiftflow")
    expect(patch.granted_scopes).toEqual(["instagram_business_basic"])
  })

  it("schedules retry with exponential backoff on transient failure", () => {
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "transient", category: "rate_limited", retryAfter: new Date(NOW.getTime() + 30 * 60 * 1000) },
      existingMetadata: { token_refresh_attempt_count: 1 },
      now: NOW,
      config,
    })
    expect(patch.token_health).toBeUndefined()
    expect(patch.token_refresh_last_status).toBe("retry_scheduled")
    expect(patch.token_refresh_last_error_code).toBe("rate_limited")
    expect(patch.token_refresh_attempt_count).toBe(2)
    expect(new Date(String(patch.token_refresh_next_at)).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it("marks reconnect_required and stops retry on permanent failure", () => {
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "permanent", category: "token_expired_or_revoked", reason: "token_expired_or_revoked" },
      existingMetadata: {},
      now: NOW,
      config,
    })
    expect(patch.token_health).toBe("invalid")
    expect(patch.reconnect_required).toBe(true)
    expect(patch.reconnect_reason).toBe("token_expired_or_revoked")
    expect(patch.token_refresh_last_status).toBe("reconnect_required")
    expect(patch.token_refresh_next_at).toBeUndefined()
  })

  it("defers too-new tokens without marking invalid", () => {
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "too_new", retryAfter: new Date(NOW.getTime() + 30 * 60 * 1000) },
      existingMetadata: {},
      now: NOW,
      config,
    })
    expect(patch.token_health).toBe("valid")
    expect(patch.token_refresh_last_status).toBe("deferred_too_new")
    expect(patch.reconnect_required).toBeUndefined()
  })
})

describe("Instagram refresh alert deduplication", () => {
  const config = defaultRefreshPolicyConfig()

  it("sends an alert after enough transient attempts", () => {
    expect(shouldSendRefreshAlert({}, 3, config.maxRetryAttempts, NOW)).toBe(true)
  })

  it("does not send alerts repeatedly within the dedupe window", () => {
    const metadata = { token_refresh_alert_sent_at: NOW.toISOString() }
    expect(shouldSendRefreshAlert(metadata, 10, config.maxRetryAttempts, NOW)).toBe(false)
  })

  it("sends a new alert after the dedupe window passes", () => {
    const metadata = { token_refresh_alert_sent_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString() }
    expect(shouldSendRefreshAlert(metadata, 3, config.maxRetryAttempts, NOW)).toBe(true)
  })

  it("does not alert for a single transient failure", () => {
    expect(shouldSendRefreshAlert({}, 1, config.maxRetryAttempts, NOW)).toBe(false)
  })

  it("alerts immediately on a permanent failure, without waiting for retry escalation", () => {
    // A revoked/expired token can never recover on its own, so the very first
    // occurrence (attemptCount 0) must reach the user.
    expect(shouldSendRefreshAlert({}, 0, config.maxRetryAttempts, NOW, true)).toBe(true)
    expect(shouldSendRefreshAlert({}, 0, config.maxRetryAttempts, NOW, false)).toBe(false)
  })

  it("still deduplicates immediate permanent alerts inside the 24h window", () => {
    const metadata = { token_refresh_alert_sent_at: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString() }
    expect(shouldSendRefreshAlert(metadata, 0, config.maxRetryAttempts, NOW, true)).toBe(false)
  })

  it("re-alerts a permanently broken account once the dedupe window elapses", () => {
    const metadata = { token_refresh_alert_sent_at: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString() }
    expect(shouldSendRefreshAlert(metadata, 0, config.maxRetryAttempts, NOW, true)).toBe(true)
  })

  it("ignores an unparseable alert timestamp instead of suppressing the alert forever", () => {
    expect(shouldSendRefreshAlert({ token_refresh_alert_sent_at: "not-a-date" }, 0, config.maxRetryAttempts, NOW, true)).toBe(true)
  })
})

describe("Instagram refresh run summary", () => {
  it("increments the real deferred_too_new field for a too-new deferral", () => {
    const summary = createRefreshRunSummary()
    const outcome = outcomeFromResult({ kind: "too_new", retryAfter: NOW })

    recordRefreshOutcome(summary, outcome)

    expect(outcome).toBe("deferred_too_new")
    expect(summary.deferred_too_new).toBe(1)
    expect(Object.keys(summary).sort()).toEqual([
      "deferred_too_new",
      "errors",
      "reconnect_required",
      "refreshed",
      "retry_scheduled",
      "skipped",
    ])
    for (const value of Object.values(summary)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(Number.isNaN(value)).toBe(false)
    }
  })

  it("maps every outcome to an existing numeric counter", () => {
    const outcomes = [
      "refreshed",
      "skipped_not_due",
      "skipped_expired",
      "skipped_reconnect_required",
      "skipped_leased",
      "retry_scheduled",
      "reconnect_required",
      "deferred_too_new",
      "error",
    ] as const

    const summary = createRefreshRunSummary()
    for (const outcome of outcomes) {
      const key = summaryKeyForOutcome(outcome)
      expect(Object.prototype.hasOwnProperty.call(summary, key)).toBe(true)
      recordRefreshOutcome(summary, outcome)
    }

    expect(summary).toEqual({
      refreshed: 1,
      deferred_too_new: 1,
      retry_scheduled: 1,
      reconnect_required: 1,
      skipped: 4,
      errors: 1,
    })
  })

  it("never yields NaN even if a counter was clobbered with a non-number", () => {
    const summary = createRefreshRunSummary()
    ;(summary as Record<string, unknown>).deferred_too_new = undefined

    recordRefreshOutcome(summary, "deferred_too_new")

    expect(summary.deferred_too_new).toBe(1)
  })
})

describe("Instagram refresh policy configuration", () => {
  it("falls back to defaults for missing, zero, negative, or unparseable overrides", () => {
    const defaults = defaultRefreshPolicyConfig()

    expect(resolveRefreshPolicyConfig()).toEqual(defaults)
    expect(resolveRefreshPolicyConfig({ renewalWindowDays: 0 }).renewalWindowDays).toBe(defaults.renewalWindowDays)
    expect(resolveRefreshPolicyConfig({ maxRetryAttempts: -3 }).maxRetryAttempts).toBe(defaults.maxRetryAttempts)
    expect(resolveRefreshPolicyConfig({ maxRetryDelayHours: Number.NaN }).maxRetryDelayHours)
      .toBe(defaults.maxRetryDelayHours)
  })

  it("applies valid overrides and keeps jitter opt-out", () => {
    const config = resolveRefreshPolicyConfig({ renewalWindowDays: 7, maxRetryAttempts: 3, jitter: false })
    expect(config.renewalWindowDays).toBe(7)
    expect(config.maxRetryAttempts).toBe(3)
    expect(config.jitter).toBe(false)
  })

  it("keeps the alert-escalation threshold independent of retry continuation", () => {
    // maxRetryAttempts only controls when alerts escalate. Backoff itself is
    // capped by maxRetryDelayHours and keeps retrying past the threshold.
    const config = resolveRefreshPolicyConfig({ maxRetryAttempts: 4, maxRetryDelayHours: 12, jitter: false })
    const patch = buildTokenRefreshMetadataPatch({
      result: { kind: "transient", category: "rate_limited", retryAfter: NOW },
      existingMetadata: { token_refresh_attempt_count: 9 },
      now: NOW,
      config,
    })

    const nextAt = new Date(String(patch.token_refresh_next_at))
    expect(patch.token_refresh_attempt_count).toBe(10)
    expect(nextAt.getTime()).toBeGreaterThan(NOW.getTime())
    expect(nextAt.getTime() - NOW.getTime()).toBeLessThanOrEqual(config.maxRetryDelayHours * 60 * 60 * 1000)
    expect(patch.reconnect_required).toBeUndefined()
  })
})


describe("Instagram refresh attempt result classification", () => {
  const config = defaultRefreshPolicyConfig()

  it("returns success for a valid refresh response", () => {
    const result = classifyRefreshAttemptResult(
      { ok: true, body: { access_token: TOKEN, expires_in: 5_184_000 } },
      config,
      NOW,
    )
    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.accessToken).toBe(TOKEN)
      expect(result.expiresIn).toBe(5_184_000)
    }
  })

  it("returns transient for 429", () => {
    const result = classifyRefreshAttemptResult(
      { ok: false, httpStatus: 429, body: { error: { message: "Rate limit" } } },
      config,
      NOW,
    )
    expect(result.kind).toBe("transient")
  })

  it("returns transient for network/timeout-like status", () => {
    const result = classifyRefreshAttemptResult(
      { ok: false, httpStatus: 0, body: { error: { message: "network_error" } } },
      config,
      NOW,
    )
    expect(result.kind).toBe("transient")
  })

  it("returns permanent for expired token", () => {
    const result = classifyRefreshAttemptResult(
      { ok: false, httpStatus: 400, body: { error: { code: 190, message: "Access token expired" } } },
      config,
      NOW,
    )
    expect(result.kind).toBe("permanent")
  })

  it("returns deferred for too-new token", () => {
    const result = classifyRefreshAttemptResult(
      { ok: false, httpStatus: 400, body: { error: { message: "Token is too new to refresh" } } },
      config,
      NOW,
    )
    expect(result.kind).toBe("too_new")
  })

  it("maps results to outcomes", () => {
    expect(outcomeFromResult({ kind: "success", accessToken: TOKEN, expiresIn: 1 })).toBe("refreshed")
    expect(outcomeFromResult({ kind: "too_new", retryAfter: NOW })).toBe("deferred_too_new")
    expect(outcomeFromResult({ kind: "permanent", category: "x", reason: "y" })).toBe("reconnect_required")
    expect(outcomeFromResult({ kind: "transient", category: "x", retryAfter: NOW })).toBe("retry_scheduled")
  })
})

describe("Instagram refresh logging safety", () => {
  it("shortens identifiers and omits sensitive details", () => {
    const log = sanitizeRefreshOutcomeForLogging({
      accountId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      workspaceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      outcome: "refreshed",
      categoryCode: "rate_limited",
      durationMs: 1234,
      attemptCount: 2,
    })
    expect(log.account_id).toBe("aaaa...aaaa")
    expect(log.workspace_id).toBe("bbbb...bbbb")
    expect(log.outcome).toBe("refreshed")
    expect(log.duration_ms).toBe(1234)
  })
})

describe("Manual Instagram refresh route", () => {
  it("retains workspace integration authorization", () => {
    const route = readFileSync(resolve(process.cwd(), "app/api/auth/instagram/refresh/route.ts"), "utf8")
    expect(route).toContain("requireWorkspacePermission")
    expect(route).toContain('"integrations:write"')
    expect(route).toContain("buildTokenRefreshMetadataPatch")
  })
})

describe("Instagram refresh worker source safety", () => {
  const sourcePath = "supabase/functions/instagram-token-refresh/index.ts"
  const source = readFileSync(resolve(process.cwd(), sourcePath), "utf8")

  it("uses redaction and does not echo tokens in responses", () => {
    expect(source).toContain("redactSensitiveLogValue")
    expect(source).not.toContain("JSON.stringify({ access_token")
    expect(source).not.toContain("access_token: decrypted")
    expect(source).toContain("summary")
  })

  it("uses redirect=manual and bounded response size", () => {
    expect(source).toContain('redirect: "manual"')
    expect(source).toContain("MAX_RESPONSE_BYTES")
  })

  it("uses atomic claim via RPC", () => {
    expect(source).toContain("claim_due_instagram_token_refreshes")
  })

  it("encrypts the replacement token before storage", () => {
    expect(source).toContain("encryptMetaToken")
  })

  it("guards every social_accounts write with the claim token it owns", () => {
    const writeBlocks = source
      .split('.from("social_accounts")')
      .slice(1)
      .filter((block) => block.includes(".update("))

    expect(writeBlocks.length).toBeGreaterThan(0)
    for (const block of writeBlocks) {
      // The claim guard must appear inside the query chain, otherwise a worker
      // whose lease went stale could overwrite newer state.
      const terminator = block.indexOf(".maybeSingle()")
      const chain = terminator === -1 ? block : block.slice(0, terminator)
      expect(chain).toContain('.eq("refresh_claim_token", claimToken)')
    }
  })

  it("aborts an account when the claim was lost instead of retrying the write", () => {
    expect(source).toContain("refresh_claim_lost")
    expect(source).toContain("if (!updatedAccount) {")
  })

  it("counts outcomes through the shared summary helpers", () => {
    expect(source).toContain("createRefreshRunSummary()")
    expect(source).toContain("recordRefreshOutcome(summary, outcome)")
    expect(source).not.toContain("summary.errors++")
  })

  it("alerts immediately on permanent failure via the immediate flag", () => {
    expect(source).toContain('outcome === "reconnect_required",')
    expect(source).toContain("shouldSendRefreshAlert(")
  })

  it("documents the hourly scheduler cadence rather than a daily one", () => {
    expect(source).toContain("once per hour")
    expect(source).not.toMatch(/invoked .*daily/i)
  })
})

describe("Client-facing refresh metadata sanitizer", () => {
  const rawMetadata: MetaAccountMetadata = {
    // Safe lifecycle fields
    token_issued_at: "2026-06-01T10:00:00.000Z",
    token_refreshed_at: "2026-07-01T10:00:00.000Z",
    token_refresh_last_status: "retry_scheduled",
    token_refresh_next_at: "2026-07-03T13:00:00.000Z",
    reconnect_required: false,
    token_health: "valid",
    // Credentials and diagnostics that must never reach the browser
    access_token: TOKEN,
    user_access_token: TOKEN,
    page_access_token: TOKEN,
    reconnect_reason: "token_expired_or_revoked",
    token_refresh_last_error_code: "rate_limited",
    token_refresh_last_error_at: "2026-07-03T11:00:00.000Z",
    token_refresh_attempt_count: 4,
    token_refresh_alert_sent_at: "2026-07-03T11:05:00.000Z",
    token_refresh_alert_reason: "rate_limited",
    provider_error_body: { error: { message: `Invalid OAuth token ${TOKEN}`, code: 190 } },
  }

  it("exposes the safe refresh lifecycle fields", () => {
    const sanitized = sanitizeMetaAccountMetadataForClient(rawMetadata)

    expect(sanitized.token_issued_at).toBe("2026-06-01T10:00:00.000Z")
    expect(sanitized.token_refreshed_at).toBe("2026-07-01T10:00:00.000Z")
    expect(sanitized.token_refresh_last_status).toBe("retry_scheduled")
    expect(sanitized.token_refresh_next_at).toBe("2026-07-03T13:00:00.000Z")
    expect(sanitized.reconnect_required).toBe(false)
  })

  it("propagates reconnect_required so the UI can show the terminal state", () => {
    const sanitized = sanitizeMetaAccountMetadataForClient({
      reconnect_required: true,
      token_refresh_last_status: "reconnect_required",
      reconnect_reason: "token_expired_or_revoked",
    })
    expect(sanitized.reconnect_required).toBe(true)
    expect(sanitized.token_refresh_last_status).toBe("reconnect_required")
    expect(sanitized.reconnect_reason).toBeUndefined()
  })

  it("strips credentials, provider errors, and internal error bookkeeping", () => {
    const sanitized = sanitizeMetaAccountMetadataForClient(rawMetadata)

    expect(sanitized.access_token).toBeUndefined()
    expect(sanitized.user_access_token).toBeUndefined()
    expect(sanitized.page_access_token).toBeUndefined()
    expect(sanitized.reconnect_reason).toBeUndefined()
    expect(sanitized.token_refresh_last_error_code).toBeUndefined()
    expect(sanitized.token_refresh_last_error_at).toBeUndefined()
    expect(sanitized.token_refresh_attempt_count).toBeUndefined()
    expect(sanitized.token_refresh_alert_sent_at).toBeUndefined()
    expect(sanitized.token_refresh_alert_reason).toBeUndefined()
    expect(sanitized.provider_error_body).toBeUndefined()
    expect(JSON.stringify(sanitized)).not.toContain(TOKEN)
  })

  it("drops unrecognized or malformed lifecycle values instead of forwarding them", () => {
    const sanitized = sanitizeMetaAccountMetadataForClient({
      token_refresh_last_status: `leaked ${TOKEN}` as never,
      token_refresh_next_at: "definitely-not-a-date",
      token_issued_at: 12345 as never,
    })

    expect(sanitized.token_refresh_last_status).toBeUndefined()
    expect(sanitized.token_refresh_next_at).toBeUndefined()
    expect(sanitized.token_issued_at).toBeUndefined()
    expect(JSON.stringify(sanitized)).not.toContain(TOKEN)
  })
})

describe("Instagram token refresh migration safety", () => {
  it("uses FOR UPDATE SKIP LOCKED for atomic claim", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260804120000_add_instagram_token_refresh_locking.sql"),
      "utf8",
    )
    expect(migration).toContain("for update skip locked")
    expect(migration).toContain("refresh_claim_token")
    expect(migration).toContain("claim_due_instagram_token_refreshes")
  })
})

describe("Connected Accounts renewal notice", () => {
  function account(
    metadata: ConnectedSocialAccount["metadata"],
    tokenExpiresAt: string | null = future(40),
  ): ConnectedSocialAccount {
    return {
      platform: "instagram",
      account_name: "swiftflow",
      account_id: ACCOUNT_ID,
      token_expires_at: tokenExpiresAt,
      metadata,
    }
  }

  it("shows nothing when Instagram is not connected", () => {
    expect(deriveRenewalNotice(false, undefined, "valid")).toBeNull()
  })

  it("shows the reconnect state for an invalid or revoked token", () => {
    for (const metadata of [
      { token_health: "invalid" } as const,
      { reconnect_required: true } as const,
      { token_refresh_last_status: "reconnect_required" } as const,
    ]) {
      const notice = deriveRenewalNotice(true, account(metadata))
      expect(notice?.tone).toBe("error")
      expect(notice?.title).toBe("Connection expired — reconnect required")
    }
  })

  it("shows the retry state with the next attempt time when one is scheduled", () => {
    const nextAt = future(1)
    const notice = deriveRenewalNotice(
      true,
      account({ token_health: "valid", token_refresh_last_status: "retry_scheduled", token_refresh_next_at: nextAt }),
    )
    expect(notice?.tone).toBe("warning")
    expect(notice?.title).toBe("Automatic renewal will retry")
    expect(notice?.message).toContain(new Date(nextAt).toLocaleString())
  })

  it("omits an unusable next-attempt time instead of rendering Invalid Date", () => {
    const notice = deriveRenewalNotice(
      true,
      account({ token_health: "valid", token_refresh_last_status: "retry_scheduled", token_refresh_next_at: "nope" }),
    )
    expect(notice?.title).toBe("Automatic renewal will retry")
    expect(notice?.message).not.toContain("Invalid Date")
    expect(notice?.message).toContain("keeps retrying with backoff")
  })

  it("explains automatic renewal when expiring soon with no retry scheduled", () => {
    const notice = deriveRenewalNotice(true, account({ token_health: "expiring_soon" }, future(3)))
    expect(notice?.tone).toBe("warning")
    expect(notice?.title).toBe("Connection expiring soon")
    expect(notice?.message).toContain("No retry is pending")
  })

  it("shows the healthy managed-renewal state for a valid token with no retry", () => {
    const notice = deriveRenewalNotice(true, account({ token_health: "valid" }))
    expect(notice?.tone).toBe("success")
    expect(notice?.title).toBe("Token renewal is managed automatically")
  })

  it("never pairs a healthy banner with a retry or reconnect warning", () => {
    // A single notice object is returned, so the mutually exclusive states are
    // structurally guaranteed rather than left to render-time conditions.
    const retryWhileHealthy = deriveRenewalNotice(
      true,
      account({ token_health: "valid", token_refresh_last_status: "retry_scheduled", token_refresh_next_at: future(1) }),
    )
    expect(retryWhileHealthy?.tone).toBe("warning")

    const reconnectWhileExpiringSoon = deriveRenewalNotice(
      true,
      account({ token_health: "expiring_soon", reconnect_required: true }),
    )
    expect(reconnectWhileExpiringSoon?.tone).toBe("error")
  })

  it("treats a deferred too-new token as healthy, not as a failed retry", () => {
    const notice = deriveRenewalNotice(
      true,
      account({ token_health: "valid", token_refresh_last_status: "deferred_too_new" }),
    )
    expect(notice?.tone).toBe("success")
  })

  it("falls back to workspace-level token health when per-account health is absent", () => {
    expect(deriveRenewalNotice(true, account({}), "invalid")?.tone).toBe("error")
    expect(deriveRenewalNotice(true, undefined, "expiring_soon")?.title).toBe("Connection expiring soon")
    expect(deriveRenewalNotice(true, undefined, null)).toBeNull()
  })
})

describe("refreshLongLivedInstagramToken validation", () => {
  it("rejects a response with missing or invalid expires_in", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: TOKEN }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch

    try {
      await refreshLongLivedInstagramToken(TOKEN, fetcher)
      expect.fail("expected refresh to throw")
    } catch (error) {
      expect(error).toHaveProperty("code", "invalid_expires_in")
    }
  })

  it("does not include the app secret in the refresh request", async () => {
    const fetcher = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain("refresh_access_token")
      expect(String(url)).toContain("grant_type=ig_refresh_token")
      expect(String(url)).not.toContain("client_secret")
      expect(String(url)).not.toContain("appsecret_proof")
      return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 5_184_000 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }) as unknown as typeof fetch

    const result = await refreshLongLivedInstagramToken(TOKEN, fetcher)
    expect(result.expires_in).toBe(5_184_000)
  })
})
