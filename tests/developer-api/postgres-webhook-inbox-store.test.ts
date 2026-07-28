import { describe, expect, it } from "vitest"

import type { WebhookInboxEvent } from "@/lib/webhooks/inbox-contract"
import type { PostgresQueryResult } from "@/lib/webhooks/postgres-inbox-repository"
import {
  buildWebhookInboxInsertSql,
  createPostgresWebhookInboxStore,
  WEBHOOK_INBOX_INSERT_COLUMNS,
} from "@/lib/webhooks/postgres-inbox-store"

interface RecordedQuery {
  text: string
  values: unknown[]
}

function createRecordingDatabase(insertedPerCall: number[]) {
  const queries: RecordedQuery[] = []
  let call = 0

  return {
    queries,
    async query(text: string, values?: unknown[]): Promise<PostgresQueryResult> {
      queries.push({ text, values: values || [] })
      const rowCount = insertedPerCall[call] ?? (values || []).length / WEBHOOK_INBOX_INSERT_COLUMNS.length
      call += 1
      return { rows: [], rowCount }
    },
  }
}

function event(overrides: Partial<WebhookInboxEvent> = {}): WebhookInboxEvent {
  return {
    provider: "meta",
    providerEventKey: "instagram:1:change:comments:c1",
    providerObject: "instagram",
    eventType: "comments",
    accountExternalId: "ig-account-1",
    deliveryHash: "a".repeat(64),
    payload: { transport: "changes" },
    ...overrides,
  }
}

describe("buildWebhookInboxInsertSql", () => {
  it("appends without reading the inbox back", () => {
    const sql = buildWebhookInboxInsertSql(1)

    expect(sql).toContain("insert into public.webhook_inbox_events")
    expect(sql).toContain("on conflict do nothing")
    // `returning` and a named conflict target both require select privilege,
    // which the append-only ingress role deliberately lacks.
    expect(sql.toLowerCase()).not.toContain("returning")
    expect(sql).not.toMatch(/on conflict\s*(\(|on constraint)/i)
  })

  it("only names columns the insert-only role is granted", () => {
    const sql = buildWebhookInboxInsertSql(1)
    const columnBlock = sql.slice(sql.indexOf("("), sql.indexOf("values"))

    for (const column of WEBHOOK_INBOX_INSERT_COLUMNS) {
      expect(columnBlock).toContain(column)
    }
    for (const lifecycleColumn of ["status", "attempt_count", "workspace_id", "locked_by"]) {
      expect(columnBlock).not.toContain(lifecycleColumn)
    }
  })

  it("numbers placeholders per row and casts the payload to jsonb", () => {
    const sql = buildWebhookInboxInsertSql(2)

    expect(sql).toContain("($1, $2, $3, $4, $5, $6, $7::jsonb)")
    expect(sql).toContain("($8, $9, $10, $11, $12, $13, $14::jsonb)")
  })
})

describe("createPostgresWebhookInboxStore", () => {
  it("returns an empty result without touching the database", async () => {
    const database = createRecordingDatabase([])
    const store = createPostgresWebhookInboxStore(database)

    await expect(store.enqueue([])).resolves.toEqual({
      total: 0,
      inserted: 0,
      duplicates: 0,
    })
    expect(database.queries).toHaveLength(0)
  })

  it("serializes every event column in order", async () => {
    const database = createRecordingDatabase([1])
    const store = createPostgresWebhookInboxStore(database)

    await store.enqueue([event({ accountExternalId: null })])

    expect(database.queries[0]!.values).toEqual([
      "meta",
      "instagram:1:change:comments:c1",
      "instagram",
      "comments",
      null,
      "a".repeat(64),
      JSON.stringify({ transport: "changes" }),
    ])
  })

  it("counts skipped conflicts as duplicates", async () => {
    const database = createRecordingDatabase([1])
    const store = createPostgresWebhookInboxStore(database)

    await expect(store.enqueue([
      event({ providerEventKey: "key-a" }),
      event({ providerEventKey: "key-b" }),
    ])).resolves.toEqual({ total: 2, inserted: 1, duplicates: 1 })
  })

  it("collapses keys repeated inside one delivery", async () => {
    const database = createRecordingDatabase([1])
    const store = createPostgresWebhookInboxStore(database)

    const result = await store.enqueue([
      event({ providerEventKey: "repeated" }),
      event({ providerEventKey: "repeated" }),
    ])

    expect(database.queries).toHaveLength(1)
    expect(database.queries[0]!.values).toHaveLength(WEBHOOK_INBOX_INSERT_COLUMNS.length)
    expect(result).toEqual({ total: 2, inserted: 1, duplicates: 1 })
  })

  it("splits large batches into bounded statements", async () => {
    const database = createRecordingDatabase([2, 1])
    const store = createPostgresWebhookInboxStore(database, 2)

    const result = await store.enqueue([
      event({ providerEventKey: "key-1" }),
      event({ providerEventKey: "key-2" }),
      event({ providerEventKey: "key-3" }),
    ])

    expect(database.queries).toHaveLength(2)
    expect(database.queries[0]!.values).toHaveLength(14)
    expect(database.queries[1]!.values).toHaveLength(7)
    expect(result).toEqual({ total: 3, inserted: 3, duplicates: 0 })
  })

  it("treats a missing row count as zero inserts", async () => {
    const store = createPostgresWebhookInboxStore({
      async query(): Promise<PostgresQueryResult> {
        return { rows: [], rowCount: null }
      },
    })

    await expect(store.enqueue([event()])).resolves.toEqual({
      total: 1,
      inserted: 0,
      duplicates: 1,
    })
  })

  it("propagates database failures so the caller can decline to acknowledge", async () => {
    const store = createPostgresWebhookInboxStore({
      async query(): Promise<PostgresQueryResult> {
        throw new Error("permission denied for table webhook_inbox_events")
      },
    })

    await expect(store.enqueue([event()])).rejects.toThrow(/permission denied/)
  })
})
