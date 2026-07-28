/**
 * Classifies provider failures and schedules retries.
 *
 * The governing rule: a request whose outcome is unknown must not be blindly
 * retried unless the outbox identity makes a duplicate send impossible. Because
 * every action carries a unique identity and is claimed transactionally, a retry
 * re-executes the same logical action rather than creating a second one - so
 * ambiguous timeouts are retryable here, and the ledger, not the provider, is
 * what prevents duplication.
 */

export type ProviderFailureClass = "retryable" | "terminal"

export interface ProviderFailure {
  /** HTTP status when the provider answered. */
  status?: number
  /** Provider-specific error code, if any. */
  code?: string | number
  message?: string
  /** Seconds from a Retry-After header, when supplied. */
  retryAfterSeconds?: number
  /** True when the request may or may not have been applied. */
  ambiguous?: boolean
}

export interface RetryDecision {
  classification: ProviderFailureClass
  retryable: boolean
  delayMs: number
  reason: string
}

export interface RetryPolicyOptions {
  baseMs?: number
  maxMs?: number
  /** Fraction of the computed delay applied as random jitter. */
  jitterRatio?: number
  random?: () => number
}

const DEFAULT_BASE_MS = 5_000
const DEFAULT_MAX_MS = 15 * 60_000
const DEFAULT_JITTER_RATIO = 0.2

/** Meta error codes that never succeed on retry. */
const TERMINAL_PROVIDER_CODES = new Set([
  "190", // invalid or expired access token
  "200", // missing permission
  "10",  // permission denied
  "803", // object does not exist
  "100", // invalid parameter / invalid target
])

/** Meta error codes that are explicitly throttling. */
const RATE_LIMIT_PROVIDER_CODES = new Set(["4", "17", "32", "613"])

function normalizedCode(code: string | number | undefined): string {
  if (code === undefined || code === null) return ""
  return String(code).trim()
}

export function classifyProviderFailure(failure: ProviderFailure): ProviderFailureClass {
  // An ambiguous outcome means the request may already have been applied. A
  // private reply is not idempotent at the provider - Meta permits exactly one
  // per comment - so retrying could either duplicate the reply or burn the only
  // allowed send. These are held for reconciliation instead of retried.
  if (failure.ambiguous === true) return "terminal"

  const code = normalizedCode(failure.code)

  if (RATE_LIMIT_PROVIDER_CODES.has(code)) return "retryable"
  if (TERMINAL_PROVIDER_CODES.has(code)) return "terminal"

  const status = failure.status

  // No HTTP response and not flagged ambiguous: the adapter established the
  // request never left, so replaying it cannot duplicate anything.
  if (status === undefined) return "retryable"

  if (status === 429) return "retryable"
  if (status === 408) return "retryable"
  if (status >= 500) return "retryable"

  // Every other 4xx is a request the provider will reject identically forever.
  if (status >= 400) return "terminal"

  return "retryable"
}

export function resolveRetryDelayMs(
  attempt: number,
  failure: ProviderFailure = {},
  options: RetryPolicyOptions = {},
): number {
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS
  const maxMs = Math.max(options.maxMs ?? DEFAULT_MAX_MS, baseMs)
  const jitterRatio = options.jitterRatio ?? DEFAULT_JITTER_RATIO
  const random = options.random ?? Math.random

  // A provider-supplied Retry-After is authoritative and is not jittered down.
  if (typeof failure.retryAfterSeconds === "number" && failure.retryAfterSeconds > 0) {
    return Math.min(Math.round(failure.retryAfterSeconds * 1000), maxMs)
  }

  const safeAttempt = Math.max(1, Math.trunc(attempt) || 1)
  const exponential = Math.min(baseMs * 2 ** (safeAttempt - 1), maxMs)
  const jitter = exponential * jitterRatio * random()

  return Math.min(Math.round(exponential + jitter), maxMs)
}

export function decideRetry(
  attempt: number,
  maxAttempts: number,
  failure: ProviderFailure,
  options: RetryPolicyOptions = {},
): RetryDecision {
  const classification = classifyProviderFailure(failure)

  if (classification === "terminal") {
    return {
      classification,
      retryable: false,
      delayMs: 0,
      reason: "provider_error_is_permanent",
    }
  }

  if (attempt >= maxAttempts) {
    return {
      classification,
      retryable: false,
      delayMs: 0,
      reason: "retry_budget_exhausted",
    }
  }

  return {
    classification,
    retryable: true,
    delayMs: resolveRetryDelayMs(attempt, failure, options),
    reason: failure.retryAfterSeconds ? "provider_retry_after" : "bounded_exponential_backoff",
  }
}

/** Strips anything that could carry a token, cookie, or payload echo. */
export function redactProviderError(message: unknown, maxLength = 500): string {
  const text = message instanceof Error ? message.message : String(message ?? "")
  return text
    .replace(/(access_token|token|secret|signature|authorization|password)=[^&\s"]+/gi, "$1=[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\bEAA[A-Za-z0-9]{10,}\b/g, "[redacted-token]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
}
