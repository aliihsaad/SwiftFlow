import crypto from "node:crypto"

export const WEBHOOK_INBOX_STATUSES = [
  "pending",
  "processing",
  "retry_scheduled",
  "succeeded",
  "ignored",
  "dead_letter",
] as const

export type WebhookInboxStatus = (typeof WEBHOOK_INBOX_STATUSES)[number]

export interface WebhookInboxEvent {
  provider: "meta"
  providerEventKey: string
  providerObject: "instagram" | "page"
  eventType: string
  accountExternalId: string | null
  deliveryHash: string
  payload: Record<string, unknown>
}

export interface WebhookInboxEnqueueResult {
  total: number
  inserted: number
  duplicates: number
}

export interface WebhookInboxStore {
  enqueue(events: WebhookInboxEvent[]): Promise<WebhookInboxEnqueueResult>
}

const ALLOWED_STATUS_TRANSITIONS: Readonly<Record<WebhookInboxStatus, readonly WebhookInboxStatus[]>> = {
  pending: ["processing"],
  processing: ["succeeded", "ignored", "retry_scheduled", "dead_letter"],
  retry_scheduled: ["processing", "dead_letter"],
  succeeded: [],
  ignored: [],
  dead_letter: [],
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter(Boolean) as Record<string, unknown>[]
    : []
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim()
    if (typeof value === "number" && Number.isFinite(value)) return String(value)
  }
  return undefined
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)

  const record = asRecord(value)
  if (!record) return value

  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  )
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function stableChangeId(value: Record<string, unknown>): string | undefined {
  const message = asRecord(value.message)
  const postback = asRecord(value.postback)

  return firstString(
    value.id,
    value.comment_id,
    value.message_id,
    message?.mid,
    postback?.mid,
  )
}

function eventKey(
  object: "instagram" | "page",
  entryId: string | null,
  channel: "change" | "messaging",
  eventType: string,
  stableId: string | undefined,
  payload: Record<string, unknown>,
): string {
  const identity = stableId || `hash_${digest(JSON.stringify(canonicalize(payload)))}`
  return `${object}:${entryId || "unresolved"}:${channel}:${eventType}:${identity}`
}

export function hashWebhookDelivery(rawBody: string | Uint8Array): string {
  return crypto.createHash("sha256").update(rawBody).digest("hex")
}

export function canTransitionWebhookInboxStatus(
  from: WebhookInboxStatus,
  to: WebhookInboxStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to)
}

export function buildMetaWebhookInboxEvents(
  body: Record<string, unknown>,
  deliveryHash = hashWebhookDelivery(JSON.stringify(canonicalize(body))),
): WebhookInboxEvent[] {
  if (body.object !== "instagram" && body.object !== "page") return []

  const providerObject = body.object
  const events: WebhookInboxEvent[] = []

  for (const entry of asRecordArray(body.entry)) {
    const entryId = firstString(entry.id) || null
    const envelope = {
      object: providerObject,
      entry_id: entryId,
      entry_time: entry.time ?? null,
    }

    for (const change of asRecordArray(entry.changes)) {
      const field = firstString(change.field) || "unknown"
      const value = asRecord(change.value) || {}
      const payload = {
        ...envelope,
        transport: "changes",
        change,
      }

      events.push({
        provider: "meta",
        providerEventKey: eventKey(
          providerObject,
          entryId,
          "change",
          field,
          stableChangeId(value),
          change,
        ),
        providerObject,
        eventType: field,
        accountExternalId: entryId,
        deliveryHash,
        payload,
      })
    }

    for (const messaging of asRecordArray(entry.messaging)) {
      const message = asRecord(messaging.message)
      const postback = asRecord(messaging.postback)
      const stableId = firstString(message?.mid, postback?.mid, messaging.id)
      const payload = {
        ...envelope,
        transport: "messaging",
        messaging,
      }

      events.push({
        provider: "meta",
        providerEventKey: eventKey(
          providerObject,
          entryId,
          "messaging",
          "messaging",
          stableId,
          messaging,
        ),
        providerObject,
        eventType: "messaging",
        accountExternalId: entryId,
        deliveryHash,
        payload,
      })
    }
  }

  return events
}

export async function enqueueMetaWebhookDelivery(
  store: WebhookInboxStore,
  body: Record<string, unknown>,
  rawBody: string | Uint8Array,
): Promise<WebhookInboxEnqueueResult> {
  const events = buildMetaWebhookInboxEvents(body, hashWebhookDelivery(rawBody))
  if (events.length === 0) {
    return { total: 0, inserted: 0, duplicates: 0 }
  }

  return store.enqueue(events)
}
