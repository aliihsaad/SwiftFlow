import { describe, expect, it } from "vitest"

import {
  assertCommentComparisonDatabaseAccess,
  assertCommentComparisonDatabaseReady,
  resolveCommentComparisonWorkerConfig,
} from "@/lib/webhooks/comment-comparison-runtime"
import type { PostgresQueryClient } from "@/lib/webhooks/postgres-inbox-repository"

function databaseWithRow(row: Record<string, unknown>): PostgresQueryClient {
  return {
    async query() {
      return { rows: [row], rowCount: 1 }
    },
  }
}

function leastPrivilegeAccess(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    rolsuper: false,
    rolcreatedb: false,
    rolcreaterole: false,
    rolreplication: false,
    rolbypassrls: false,
    schema_usage: true,
    schema_create: false,
    inbox_select: true,
    inbox_required_updates: true,
    social_accounts_required_selects: true,
    automations_required_selects: true,
    claim_execute: true,
    inbox_insert: false,
    inbox_delete: false,
    inbox_truncate: false,
    payload_update: false,
    social_account_token_select: false,
    workspaces_select: false,
    ...overrides,
  }
}

describe("comment comparison worker runtime", () => {
  it("builds deterministic safe defaults", () => {
    expect(resolveCommentComparisonWorkerConfig({}, {
      hostname: "worker-host",
      pid: 42,
    })).toEqual({
      workerId: "worker-host-42",
      batchSize: 10,
      leaseSeconds: 60,
      pollIntervalMs: 1_000,
      runOnce: false,
      enqueueActions: false,
      retryBaseMs: 5_000,
      retryMaxMs: 15 * 60_000,
    })
  })

  it("trims identifiers and bounds numeric settings", () => {
    expect(resolveCommentComparisonWorkerConfig({
      WEBHOOK_COMPARISON_WORKER_ID: " worker-1 ",
      WEBHOOK_COMPARISON_BATCH_SIZE: "1000",
      WEBHOOK_COMPARISON_LEASE_SECONDS: "1",
      WEBHOOK_COMPARISON_POLL_INTERVAL_MS: "0",
      WEBHOOK_COMPARISON_RETRY_BASE_MS: "2000",
      WEBHOOK_COMPARISON_RETRY_MAX_MS: "1000",
      WEBHOOK_COMPARISON_RUN_ONCE: "true",
    }, {
      hostname: "unused",
      pid: 1,
    })).toEqual({
      workerId: "worker-1",
      batchSize: 100,
      leaseSeconds: 5,
      pollIntervalMs: 50,
      runOnce: true,
      enqueueActions: false,
      retryBaseMs: 2_000,
      retryMaxMs: 2_000,
    })
  })

  it("accepts a database only when the inbox table and claim function exist", async () => {
    await expect(assertCommentComparisonDatabaseReady(databaseWithRow({
      inbox_table: "webhook_inbox_events",
      claim_function: "claim_webhook_inbox_events(text,integer,integer)",
    }))).resolves.toBeUndefined()

    await expect(assertCommentComparisonDatabaseReady(databaseWithRow({
      inbox_table: null,
      claim_function: null,
    }))).rejects.toThrow("Webhook inbox schema is not ready")
  })

  it("accepts only the required least-privilege database access", async () => {
    await expect(assertCommentComparisonDatabaseAccess(
      databaseWithRow(leastPrivilegeAccess()),
    )).resolves.toBeUndefined()
  })

  it("rejects a worker login with missing required access", async () => {
    await expect(assertCommentComparisonDatabaseAccess(databaseWithRow(
      leastPrivilegeAccess({ automations_required_selects: false }),
    ))).rejects.toThrow(
      "missing automations_required_selects",
    )
  })

  it("rejects owner, bypass, and unrelated data privileges", async () => {
    await expect(assertCommentComparisonDatabaseAccess(databaseWithRow(
      leastPrivilegeAccess({
        rolsuper: true,
        payload_update: true,
        social_account_token_select: true,
        workspaces_select: true,
      }),
    ))).rejects.toThrow(
      "forbidden rolsuper, payload_update, social_account_token_select, workspaces_select",
    )
  })
})
