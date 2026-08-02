import type { Pool } from "pg"

import type {
  WebhookInboxEnqueueResult,
  WebhookInboxEvent,
  WebhookInboxStore,
} from "./inbox-contract"
import {
  createPostgresQueryClient,
  type PostgresQueryClient,
} from "./postgres-inbox-repository"

/** Column order used by every generated insert statement. */
export const WEBHOOK_INBOX_INSERT_COLUMNS = [
  "provider",
  "provider_event_key",
  "provider_object",
  "event_type",
  "account_external_id",
  "delivery_hash",
  "payload",
] as const

const COLUMNS_PER_ROW = WEBHOOK_INBOX_INSERT_COLUMNS.length

/**
 * Rows per statement. Meta batches are small, and a bounded chunk keeps the
 * statement well inside PostgreSQL's parameter limit even under a burst.
 */
export const WEBHOOK_INBOX_INSERT_CHUNK_SIZE = 50

/**
 * Builds a multi-row insert for `count` events.
 *
 * Two things are deliberately absent so the statement runs under an insert-only
 * role:
 *
 * - No `returning` clause. `returning` requires `select` privilege, so the
 *   number of appended rows comes from the insert command tag instead and the
 *   ingress never reads the inbox back.
 * - No `on conflict` target. Naming an arbiter index or constraint also
 *   requires `select` privilege on the table. An untargeted `do nothing` is
 *   unambiguous here because `webhook_inbox_events` has exactly one unique
 *   constraint besides its defaulted primary key, which
 *   `webhook ingress database role > relies on a single unique constraint`
 *   enforces. Check-constraint violations are still raised normally.
 */
export function buildWebhookInboxInsertSql(count: number): string {
  const rows: string[] = []

  for (let row = 0; row < count; row += 1) {
    const offset = row * COLUMNS_PER_ROW
    rows.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`,
    )
  }

  return `
    insert into public.webhook_inbox_events (
      ${WEBHOOK_INBOX_INSERT_COLUMNS.join(",\n      ")}
    )
    values ${rows.join(", ")}
    on conflict do nothing
  `
}

function insertValues(events: WebhookInboxEvent[]): unknown[] {
  return events.flatMap((event) => [
    event.provider,
    event.providerEventKey,
    event.providerObject,
    event.eventType,
    event.accountExternalId,
    event.deliveryHash,
    JSON.stringify(event.payload ?? {}),
  ])
}

/**
 * Drops events that repeat a `(provider, provider_event_key)` pair inside one
 * delivery so the inserted/duplicate counts stay meaningful for a batch that
 * Meta already deduplicated at the statement level.
 */
function withoutRepeatedKeys(events: WebhookInboxEvent[]): WebhookInboxEvent[] {
  const seen = new Set<string>()

  return events.filter((event) => {
    const key = `${event.provider}:${event.providerEventKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function chunked<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

export function createPostgresWebhookInboxStore(
  database: PostgresQueryClient,
  chunkSize: number = WEBHOOK_INBOX_INSERT_CHUNK_SIZE,
): WebhookInboxStore {
  const boundedChunkSize = Math.min(Math.max(Math.trunc(chunkSize) || 1, 1), 100)

  return {
    async enqueue(events): Promise<WebhookInboxEnqueueResult> {
      const total = events.length
      if (total === 0) {
        return { total: 0, inserted: 0, duplicates: 0 }
      }

      let inserted = 0
      for (const chunk of chunked(withoutRepeatedKeys(events), boundedChunkSize)) {
        const result = await database.query(
          buildWebhookInboxInsertSql(chunk.length),
          insertValues(chunk),
        )
        inserted += result.rowCount || 0
      }

      return { total, inserted, duplicates: total - inserted }
    },
  }
}

export function createPostgresWebhookInboxStoreFromPool(pool: Pool): WebhookInboxStore {
  return createPostgresWebhookInboxStore(createPostgresQueryClient(pool))
}
