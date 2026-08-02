import { describe, expect, it } from "vitest"

import { buildPostgresPoolConfig } from "@/lib/database/postgres"
import {
  CLAIM_WEBHOOK_INBOX_SQL,
  COMPLETE_WEBHOOK_INBOX_SQL,
  EXTEND_WEBHOOK_INBOX_LEASE_SQL,
  FAIL_WEBHOOK_INBOX_SQL,
  PostgresWebhookInboxRepository,
  type PostgresQueryClient,
} from "@/lib/webhooks/postgres-inbox-repository"

class RecordingDatabase implements PostgresQueryClient {
  calls: Array<{ text: string; values?: unknown[] }> = []
  nextRows: Record<string, unknown>[] = []
  nextRowCount: number | null = 0

  async query(text: string, values?: unknown[]) {
    this.calls.push({ text, values })
    return { rows: this.nextRows, rowCount: this.nextRowCount }
  }
}

describe("PostgreSQL webhook inbox repository", () => {
  it("claims a bounded batch through the atomic database function", async () => {
    const database = new RecordingDatabase()
    database.nextRows = [{
      id: "event-1",
      provider: "meta",
      provider_event_key: "comment:1",
      provider_object: "instagram",
      event_type: "comments",
      workspace_id: null,
      social_account_id: null,
      account_external_id: "account-1",
      delivery_hash: "a".repeat(64),
      payload: { change: {} },
      attempt_count: 1,
      max_attempts: 8,
      locked_by: "worker-1",
      lock_expires_at: new Date("2026-07-26T13:01:00.000Z"),
      received_at: new Date("2026-07-26T13:00:00.000Z"),
    }]
    const repository = new PostgresWebhookInboxRepository(database)

    const claimed = await repository.claim("worker-1", 500, 0)

    expect(database.calls[0]).toEqual({
      text: CLAIM_WEBHOOK_INBOX_SQL,
      values: ["worker-1", 100, 1],
    })
    expect(claimed[0]).toMatchObject({
      id: "event-1",
      status: "processing",
      attemptCount: 1,
      lockedBy: "worker-1",
      lockExpiresAt: "2026-07-26T13:01:00.000Z",
    })
  })

  it("finalizes only the current unexpired lease owner", async () => {
    const database = new RecordingDatabase()
    database.nextRows = [{ status: "succeeded" }]
    database.nextRowCount = 1
    const repository = new PostgresWebhookInboxRepository(database)

    await expect(repository.complete("event-1", " worker-1 ", {
      outcome: "succeeded",
      workspaceId: "workspace-1",
      socialAccountId: "account-row-1",
      result: { mode: "comparison", sideEffectsExecuted: false },
    })).resolves.toEqual({ updated: true, status: "succeeded" })

    expect(database.calls[0]?.text).toBe(COMPLETE_WEBHOOK_INBOX_SQL)
    expect(database.calls[0]?.text).toContain("locked_by = $2")
    expect(database.calls[0]?.text).toContain("lock_expires_at > now()")
    expect(database.calls[0]?.values).toEqual([
      "event-1",
      "worker-1",
      "succeeded",
      "workspace-1",
      "account-row-1",
      JSON.stringify({ mode: "comparison", sideEffectsExecuted: false }),
    ])
  })

  it("schedules retry or dead-letter atomically without leaking raw multiline errors", async () => {
    const database = new RecordingDatabase()
    database.nextRows = [{ status: "retry_scheduled" }]
    const repository = new PostgresWebhookInboxRepository(database)
    const retryAt = new Date("2026-07-26T13:05:00.000Z")

    await expect(repository.fail("event-1", "worker-1", {
      code: "provider_timeout",
      message: "Provider\n timed\tout",
      retryAt,
    })).resolves.toEqual({ updated: true, status: "retry_scheduled" })

    expect(database.calls[0]?.text).toBe(FAIL_WEBHOOK_INBOX_SQL)
    expect(database.calls[0]?.text).toContain("attempt_count >= max_attempts")
    expect(database.calls[0]?.text).toContain("locked_by = $2")
    expect(database.calls[0]?.values).toEqual([
      "event-1",
      "worker-1",
      "provider_timeout",
      "Provider timed out",
      retryAt.toISOString(),
      false,
    ])
  })

  it("extends a lease only while the same worker still owns it", async () => {
    const database = new RecordingDatabase()
    database.nextRows = [{ id: "event-1" }]
    database.nextRowCount = 1
    const repository = new PostgresWebhookInboxRepository(database)

    await expect(repository.extendLease("event-1", "worker-1", 90)).resolves.toBe(true)
    expect(database.calls[0]).toEqual({
      text: EXTEND_WEBHOOK_INBOX_LEASE_SQL,
      values: ["event-1", "worker-1", 90],
    })
    expect(database.calls[0]?.text).toContain("lock_expires_at > now()")
  })

  it("builds a bounded pool configuration without exposing the connection string", () => {
    const config = buildPostgresPoolConfig({
      DATABASE_URL: "postgresql://user:secret@db.example/swiftflow",
      POSTGRES_POOL_MAX: "25",
      POSTGRES_SSL_MODE: "require",
      POSTGRES_SSL_REJECT_UNAUTHORIZED: "true",
    })

    expect(config).toMatchObject({
      application_name: "swiftflow-webhook-worker",
      max: 25,
      ssl: { rejectUnauthorized: true },
    })
    expect(buildPostgresPoolConfig({
      DATABASE_URL: "postgresql://user:secret@db.example/swiftflow",
      POSTGRES_POOL_MAX: "500",
      POSTGRES_IDLE_TIMEOUT_MS: "9999999",
      POSTGRES_CONNECTION_TIMEOUT_MS: "9999999",
    })).toMatchObject({
      max: 50,
      idleTimeoutMillis: 10 * 60_000,
      connectionTimeoutMillis: 2 * 60_000,
    })

    expect(() => buildPostgresPoolConfig({})).toThrow(
      "DATABASE_URL is required for the PostgreSQL worker runtime",
    )
  })
})
