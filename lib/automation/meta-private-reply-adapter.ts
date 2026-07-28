import type { ActionOutboxRecord } from "./action-outbox-contract"
import { redactProviderError } from "./action-retry-policy"
import type {
  ProviderActionAdapter,
  ProviderActionCredentials,
  ProviderActionOutcome,
} from "./provider-action-adapter"

/**
 * Instagram private-reply adapter (Instagram API with Instagram Login).
 *
 * Verified against Meta's Instagram Platform private-replies documentation on
 * 2026-07-27:
 *
 *   POST https://graph.instagram.com/<version>/<ig-user-id>/messages
 *   Authorization: Bearer <token>
 *   { "recipient": { "comment_id": "..." }, "message": { "text": "..." } }
 *
 * Success returns `recipient_id` and `message_id`. Required permissions are
 * instagram_business_basic and instagram_business_manage_comments - a private
 * reply is authorised as a comment capability, not a messaging one.
 *
 * Provider rules that shape this adapter: exactly ONE private reply is
 * permitted per comment, and only within 7 days of the comment. That makes the
 * send non-idempotent at the provider, which is why an ambiguous outcome is
 * never auto-retried.
 */

export const META_PRIVATE_REPLY_API_VERSION = "v23.0"
export const META_INSTAGRAM_GRAPH_HOST = "https://graph.instagram.com"

/** Meta caps message text well below this; the bound is a safety net. */
const MAX_MESSAGE_LENGTH = 1_000
const MAX_RESPONSE_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 10_000

export interface MetaPrivateReplyAdapterOptions {
  apiVersion?: string
  host?: string
  timeoutMs?: number
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch
}

export interface SanitizedRequestShape {
  method: string
  /** Path with the account id replaced, so nothing identifying is logged. */
  urlShape: string
  bodyShape: Record<string, string>
  hasAuthorizationHeader: boolean
}

export class MetaPrivateReplyPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MetaPrivateReplyPayloadError"
  }
}

function messageText(record: ActionOutboxRecord): string {
  const raw = record.payload?.message
  const text = typeof raw === "string" ? raw.trim() : ""
  if (!text) {
    throw new MetaPrivateReplyPayloadError("Private reply payload has no message text")
  }
  return text.slice(0, MAX_MESSAGE_LENGTH)
}

/** Describes the request without any credential, for logs and rehearsal. */
export function describeRequestShape(record: ActionOutboxRecord): SanitizedRequestShape {
  return {
    method: "POST",
    urlShape: `${META_INSTAGRAM_GRAPH_HOST}/${META_PRIVATE_REPLY_API_VERSION}/{ig-user-id}/messages`,
    bodyShape: {
      "recipient.comment_id": record.identity.targetId ? "<comment-id>" : "<missing>",
      "message.text": "<text>",
    },
    hasAuthorizationHeader: true,
  }
}

function parseRetryAfterSeconds(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined

  const asSeconds = Number(headerValue)
  if (Number.isFinite(asSeconds) && asSeconds > 0) return asSeconds

  const asDate = Date.parse(headerValue)
  if (Number.isFinite(asDate)) {
    const delta = Math.ceil((asDate - Date.now()) / 1000)
    return delta > 0 ? delta : undefined
  }
  return undefined
}

/** Keeps identifiers, drops anything that could echo a token or payload. */
function redactResponse(body: unknown): Record<string, unknown> {
  const record = body && typeof body === "object" ? body as Record<string, unknown> : {}
  const safe: Record<string, unknown> = {}

  for (const key of ["recipient_id", "message_id", "id"]) {
    if (typeof record[key] === "string") safe[key] = record[key]
  }
  return safe
}

async function readBoundedText(response: Response): Promise<string> {
  const body = response.body
  if (!body) return ""

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel()
        break
      }
      chunks.push(value)
    }
  } catch {
    return ""
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8")
}

export function createMetaPrivateReplyAdapter(
  options: MetaPrivateReplyAdapterOptions = {},
): ProviderActionAdapter {
  const apiVersion = options.apiVersion || META_PRIVATE_REPLY_API_VERSION
  const host = (options.host || META_INSTAGRAM_GRAPH_HOST).replace(/\/+$/, "")
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = options.fetchImpl ?? fetch

  return {
    name: "meta-instagram-private-reply",

    async send(
      record: ActionOutboxRecord,
      credentials: ProviderActionCredentials,
    ): Promise<ProviderActionOutcome> {
      if (record.identity.actionType !== "action_private_reply") {
        return {
          ok: false,
          failure: {
            code: "unsupported_action_type",
            message: `Adapter cannot handle ${record.identity.actionType}`,
            status: 400,
          },
        }
      }

      let text: string
      try {
        text = messageText(record)
      } catch (error) {
        // A malformed payload will never become valid; do not retry it.
        return {
          ok: false,
          failure: {
            code: "invalid_action_payload",
            message: redactProviderError(error),
            status: 400,
          },
        }
      }

      if (!record.identity.targetId) {
        return {
          ok: false,
          failure: { code: "missing_comment_id", message: "No comment id to reply to", status: 400 },
        }
      }

      const url = `${host}/${apiVersion}/${encodeURIComponent(credentials.externalAccountId)}/messages`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      // Once the request is dispatched we can no longer prove it was not
      // applied, so any failure from here on is ambiguous rather than retryable.
      let dispatched = false

      try {
        dispatched = true
        const response = await fetchImpl(url, {
          method: "POST",
          headers: {
            // Bearer keeps the token out of the URL, query string and any log.
            authorization: `Bearer ${credentials.accessToken}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            recipient: { comment_id: record.identity.targetId },
            message: { text },
          }),
          signal: controller.signal,
          redirect: "error",
        })

        const raw = await readBoundedText(response)
        let parsed: unknown
        try {
          parsed = raw ? JSON.parse(raw) : {}
        } catch {
          parsed = {}
        }

        if (response.ok) {
          const safe = redactResponse(parsed)
          return {
            ok: true,
            providerResponseId:
              typeof safe.message_id === "string" ? safe.message_id : null,
            response: safe,
          }
        }

        const errorRecord = (parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>).error
          : null) as Record<string, unknown> | null

        return {
          ok: false,
          failure: {
            status: response.status,
            code: errorRecord?.code !== undefined ? String(errorRecord.code) : undefined,
            message: redactProviderError(
              typeof errorRecord?.message === "string" ? errorRecord.message : raw,
            ),
            retryAfterSeconds: parseRetryAfterSeconds(response.headers.get("retry-after")),
          },
        }
      } catch (error) {
        const aborted = controller.signal.aborted
        return {
          ok: false,
          failure: {
            code: aborted ? "request_timeout" : "network_failure",
            message: redactProviderError(error),
            // The request left this process; a replay could produce a second
            // reply or consume the single permitted send.
            ambiguous: dispatched,
          },
        }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
