// @ts-nocheck - Deno runtime helper

export const META_GRAPH_API_VERSION = "v25.0"
export const INSTAGRAM_GRAPH_API_BASE_URL = `https://graph.instagram.com/${META_GRAPH_API_VERSION}`
export const META_GRAPH_API_BASE_URL = INSTAGRAM_GRAPH_API_BASE_URL

export type MetaConnectionMethod = "instagram_login"

export interface MetaGraphCredentialContext {
  connectionMethod?: MetaConnectionMethod | string | null
}

const META_GRAPH_NODE_ID_RE = /^[0-9_]{3,128}$/

export function isSafeMetaGraphNodeId(value: unknown): value is string {
  return typeof value === 'string' && META_GRAPH_NODE_ID_RE.test(value.trim())
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function createMetaAppSecretProof(accessToken: string, appSecret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken))
  return bytesToHex(signature)
}

export function getMetaGraphApiBaseUrl(
  _connectionMethod?: MetaGraphCredentialContext["connectionMethod"],
): string {
  return INSTAGRAM_GRAPH_API_BASE_URL
}

export function getMetaAppSecret(
  _context: MetaGraphCredentialContext = {},
): string {
  return Deno.env.get("INSTAGRAM_APP_SECRET")?.trim() || ""
}

export async function withMetaAppSecretProof<T extends Record<string, unknown>>(
  payload: T,
  accessToken: string,
  context: MetaGraphCredentialContext = {},
): Promise<T & { appsecret_proof?: string }> {
  const appSecret = getMetaAppSecret(context)
  if (!appSecret || !accessToken) return payload

  return {
    ...payload,
    appsecret_proof: await createMetaAppSecretProof(accessToken, appSecret),
  }
}

export async function toMetaGraphFormBody(
  payload: Record<string, unknown>,
  accessToken: string,
  context: MetaGraphCredentialContext = {},
): Promise<URLSearchParams> {
  const signedPayload = await withMetaAppSecretProof(payload, accessToken, context)
  const body = new URLSearchParams()

  for (const [key, value] of Object.entries(signedPayload)) {
    if (value == null) continue
    body.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

  return body
}

// ---------------------------------------------------------------------------
// Graph fetch with retry/backoff and usage-header monitoring.
//
// Retries 429s, 5xx responses, and network failures with exponential backoff
// plus jitter. Only idempotent requests (GET/HEAD) are retried by default —
// provider-mutating POSTs must not be replayed blindly or a transient timeout could
// double-post; opt in with `retryNonIdempotent` when the endpoint is safe.
//
// Mirrored for Next.js in lib/meta-graph-fetch.ts — keep the two
// implementations in sync when changing retry semantics.
// ---------------------------------------------------------------------------

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500
const MAX_DELAY_MS = 8_000
const APP_USAGE_WARN_THRESHOLD = 80

function sanitizeGraphUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.searchParams.has('access_token')) parsed.searchParams.set('access_token', 'redacted')
    if (parsed.searchParams.has('appsecret_proof')) parsed.searchParams.set('appsecret_proof', 'redacted')
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return 'invalid-url'
  }
}

function collectNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value]
  if (Array.isArray(value)) return value.flatMap(collectNumbers)
  if (value && typeof value === 'object') return Object.values(value).flatMap(collectNumbers)
  return []
}

/** X-App-Usage / X-Business-Use-Case-Usage carry percent-of-quota counters. */
function logGraphUsage(response: Response, url: string): void {
  for (const header of ['x-app-usage', 'x-business-use-case-usage']) {
    const raw = response.headers.get(header)
    if (!raw) continue
    try {
      if (collectNumbers(JSON.parse(raw)).some((value) => value >= APP_USAGE_WARN_THRESHOLD)) {
        console.warn(`[meta-graph] ${header} nearing limit for ${sanitizeGraphUrl(url)}: ${raw}`)
      }
    } catch {
      // Unparseable header — ignore rather than fail the request path.
    }
  }
}

function retryDelayMs(attempt: number, baseDelayMs: number, response?: Response): number {
  const retryAfterSeconds = Number(response?.headers.get('retry-after') || 0)
  const backoff = baseDelayMs * 2 ** attempt * (0.5 + Math.random() * 0.5)
  return Math.min(Math.max(backoff, retryAfterSeconds * 1000), MAX_DELAY_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface MetaGraphRetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  retryNonIdempotent?: boolean
}

export async function metaGraphFetch(
  url: string,
  init?: RequestInit,
  options?: MetaGraphRetryOptions,
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const method = (init?.method || 'GET').toUpperCase()
  const retryable = options?.retryNonIdempotent || method === 'GET' || method === 'HEAD'

  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response
    try {
      response = await fetch(url, init)
    } catch (error) {
      lastError = error
      if (!retryable || attempt >= maxAttempts - 1) throw error
      await sleep(retryDelayMs(attempt, baseDelayMs))
      continue
    }

    logGraphUsage(response, url)

    const shouldRetry = retryable && (response.status === 429 || response.status >= 500)
    if (!shouldRetry || attempt >= maxAttempts - 1) return response

    console.warn(
      `[meta-graph] retrying ${method} ${sanitizeGraphUrl(url)} after status ${response.status} (attempt ${attempt + 1}/${maxAttempts})`,
    )
    await sleep(retryDelayMs(attempt, baseDelayMs, response))
  }

  // Unreachable: the loop always returns or throws on its last attempt.
  throw lastError instanceof Error ? lastError : new Error('Meta Graph request failed')
}
