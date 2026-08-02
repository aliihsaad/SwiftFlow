import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { assertCommentComparisonDatabaseAccess } from "@/lib/webhooks/comment-comparison-runtime"
import { createCommentPrivateReplyComparisonWorker } from "@/lib/webhooks/comment-comparison-worker"
import {
  PostgresWebhookInboxRepository,
  createPostgresQueryClient,
} from "@/lib/webhooks/postgres-inbox-repository"

function requireLocalTestDatabaseUrl(variableName: string): string {
  const value = process.env[variableName]?.trim()
  if (!value) {
    throw new Error(`${variableName} is required`)
  }

  const url = new URL(value)
  const databaseName = url.pathname.replace(/^\//, "")
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"])
  if (!localHosts.has(url.hostname) || !databaseName.toLowerCase().includes("test")) {
    throw new Error("PostgreSQL integration tests require a local database with 'test' in its name")
  }
  return value
}

interface InboxSeed {
  providerEventKey?: string
  accountExternalId?: string | null
  payload?: Record<string, unknown>
  maxAttempts?: number
}

let pool: Pool
let workerPool: Pool

async function insertInboxEvent(seed: InboxSeed = {}): Promise<string> {
  const result = await pool.query<{ id: string }>(`
    insert into public.webhook_inbox_events (
      provider,
      provider_event_key,
      provider_object,
      event_type,
      account_external_id,
      delivery_hash,
      payload,
      max_attempts
    )
    values ('meta', $1, 'instagram', 'comments', $2, $3, $4::jsonb, $5)
    returning id
  `, [
    seed.providerEventKey || `comments:${randomUUID()}`,
    seed.accountExternalId ?? "ig-account-1",
    "a".repeat(64),
    JSON.stringify(seed.payload || {}),
    seed.maxAttempts ?? 3,
  ])
  return result.rows[0]!.id
}

beforeAll(async () => {
  pool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_DATABASE_URL"),
    max: 8,
    connectionTimeoutMillis: 5_000,
  })
  workerPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl(
      "SWIFTFLOW_TEST_WORKER_DATABASE_URL",
    ),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  await pool.query("select 1")
  await workerPool.query("select 1")
})

beforeEach(async () => {
  await pool.query(`
    truncate table
      public.webhook_inbox_events,
      public.automations,
      public.social_accounts,
      public.workspaces
    restart identity cascade
  `)
})

afterAll(async () => {
  await workerPool?.end()
  await pool?.end()
})

describe("durable PostgreSQL webhook inbox", () => {
  it("applies the migration and rejects duplicate provider event keys", async () => {
    const eventKey = `comments:${randomUUID()}`
    await insertInboxEvent({ providerEventKey: eventKey })

    await expect(insertInboxEvent({ providerEventKey: eventKey })).rejects.toMatchObject({
      code: "23505",
    })

    const schema = await pool.query(`
      select
        to_regclass('public.webhook_inbox_events')::text as inbox_table,
        to_regprocedure(
          'public.claim_webhook_inbox_events(text,integer,integer)'
        )::text as claim_function
    `)
    expect(schema.rows[0]).toMatchObject({
      inbox_table: "webhook_inbox_events",
      claim_function: "claim_webhook_inbox_events(text,integer,integer)",
    })
  })

  it("uses a restricted login with only comparison-worker privileges", async () => {
    await expect(assertCommentComparisonDatabaseAccess(
      createPostgresQueryClient(workerPool),
    )).resolves.toBeUndefined()
    await expect(assertCommentComparisonDatabaseAccess(
      createPostgresQueryClient(pool),
    )).rejects.toThrow("forbidden rolsuper")

    const attributes = await workerPool.query(`
      select rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
      from pg_roles
      where rolname = current_user
    `)
    expect(attributes.rows[0]).toEqual({
      rolsuper: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolbypassrls: false,
    })

    const privileges = await workerPool.query(`
      select
        has_table_privilege(
          current_user,
          'public.webhook_inbox_events',
          'select'
        ) as inbox_select,
        has_column_privilege(
          current_user,
          'public.webhook_inbox_events',
          'status',
          'update'
        ) as inbox_status_update,
        has_column_privilege(
          current_user,
          'public.social_accounts',
          'account_id',
          'select'
        ) as social_accounts_account_id_select,
        has_column_privilege(
          current_user,
          'public.automations',
          'workflow_graph',
          'select'
        ) as automations_workflow_graph_select,
        has_column_privilege(
          current_user,
          'public.social_accounts',
          'access_token',
          'select'
        ) as social_accounts_access_token_select
    `)
    expect(privileges.rows[0]).toEqual({
      inbox_select: true,
      inbox_status_update: true,
      social_accounts_account_id_select: true,
      automations_workflow_graph_select: true,
      social_accounts_access_token_select: false,
    })

    await expect(
      workerPool.query("select * from public.workspaces"),
    ).rejects.toMatchObject({ code: "42501" })
    await expect(
      workerPool.query("select access_token from public.social_accounts"),
    ).rejects.toMatchObject({ code: "42501" })
    await expect(
      workerPool.query("insert into public.webhook_inbox_events default values"),
    ).rejects.toMatchObject({ code: "42501" })
    await expect(workerPool.query(`
      update public.webhook_inbox_events
      set payload = '{}'::jsonb
      where false
    `)).rejects.toMatchObject({ code: "42501" })
  })

  it("allows only one concurrent worker to claim an event", async () => {
    await insertInboxEvent()
    const first = new PostgresWebhookInboxRepository(createPostgresQueryClient(pool))
    const second = new PostgresWebhookInboxRepository(createPostgresQueryClient(pool))

    const claims = await Promise.all([
      first.claim("worker-a", 1, 30),
      second.claim("worker-b", 1, 30),
    ])

    expect(claims.flat()).toHaveLength(1)
    const state = await pool.query(`
      select status, attempt_count, locked_by
      from public.webhook_inbox_events
    `)
    expect(state.rows[0]).toMatchObject({
      status: "processing",
      attempt_count: 1,
    })
    expect(["worker-a", "worker-b"]).toContain(state.rows[0]?.locked_by)
  })

  it("recovers an expired lease and rejects completion by the stale owner", async () => {
    await insertInboxEvent()
    const repository = new PostgresWebhookInboxRepository(createPostgresQueryClient(pool))
    const [firstClaim] = await repository.claim("crashed-worker", 1, 1)
    expect(firstClaim).toBeDefined()

    await pool.query("select pg_sleep(1.2)")
    const [recovered] = await repository.claim("recovery-worker", 1, 30)
    expect(recovered).toMatchObject({ attemptCount: 2, lockedBy: "recovery-worker" })

    await expect(repository.complete(firstClaim!.id, "crashed-worker", {
      outcome: "succeeded",
    })).resolves.toEqual({ updated: false, status: "lost_lease" })
    await expect(repository.complete(recovered!.id, "recovery-worker", {
      outcome: "succeeded",
      result: { recovered: true },
    })).resolves.toEqual({ updated: true, status: "succeeded" })
  })

  it("moves the final failed attempt to the dead-letter state", async () => {
    await insertInboxEvent({ maxAttempts: 2 })
    const repository = new PostgresWebhookInboxRepository(createPostgresQueryClient(pool))
    const [first] = await repository.claim("retry-worker", 1, 30)

    await expect(repository.fail(first!.id, "retry-worker", {
      code: "provider_timeout",
      message: "Provider timed out",
      retryAt: new Date(Date.now() - 1_000),
    })).resolves.toEqual({ updated: true, status: "retry_scheduled" })

    const [second] = await repository.claim("retry-worker", 1, 30)
    await expect(repository.fail(second!.id, "retry-worker", {
      code: "provider_timeout",
      message: "Provider timed out again",
      retryAt: new Date(),
    })).resolves.toEqual({ updated: true, status: "dead_letter" })

    const state = await pool.query(`
      select status, attempt_count, last_error_code
      from public.webhook_inbox_events
    `)
    expect(state.rows[0]).toMatchObject({
      status: "dead_letter",
      attempt_count: 2,
      last_error_code: "provider_timeout",
    })
  })

  it("records a real comparison result without executing a Meta side effect", async () => {
    const workspaceId = randomUUID()
    const accountId = randomUUID()
    const automationId = randomUUID()
    await pool.query(`
      insert into public.workspaces (id, name)
      values ($1, 'Comparison Workspace')
    `, [workspaceId])
    await pool.query(`
      insert into public.social_accounts (
        id,
        workspace_id,
        platform,
        account_id,
        metadata
      )
      values ($1, $2, 'instagram', 'ig-account-1', $3::jsonb)
    `, [
      accountId,
      workspaceId,
      JSON.stringify({ connected_page_id: "page-1" }),
    ])
    await pool.query(`
      insert into public.automations (
        id,
        workspace_id,
        social_account_id,
        workflow_graph
      )
      values ($1, $2, $3, $4::jsonb)
    `, [
      automationId,
      workspaceId,
      accountId,
      JSON.stringify({
        nodes: [
          {
            id: "trigger",
            data: {
              type: "trigger_new_comment",
              config: {
                social_account_id: accountId,
                trigger_type: "keywords",
                keywords: ["price"],
                post_scope: "specific",
                post_id: "post-1",
              },
            },
          },
          {
            id: "private-reply",
            data: {
              type: "action_private_reply",
              config: { message: "Thanks — details are on the way." },
            },
          },
        ],
        edges: [{ id: "edge-1", source: "trigger", target: "private-reply" }],
      }),
    ])
    const eventId = await insertInboxEvent({
      payload: {
        change: {
          field: "comments",
          value: {
            id: "comment-1",
            text: "What is the price?",
            from: { id: "customer-1", username: "customer" },
            media: { id: "post-1", media_product_type: "FEED" },
          },
        },
      },
    })

    const worker = createCommentPrivateReplyComparisonWorker(workerPool, {
      workerId: "integration-comparison-worker",
      batchSize: 1,
      leaseSeconds: 30,
    })
    await expect(worker.runOnce()).resolves.toMatchObject({
      claimed: 1,
      succeeded: 1,
      lostLease: 0,
    })

    const result = await pool.query(`
      select status, workspace_id, social_account_id, result
      from public.webhook_inbox_events
      where id = $1
    `, [eventId])
    expect(result.rows[0]).toMatchObject({
      status: "succeeded",
      workspace_id: workspaceId,
      social_account_id: accountId,
      result: {
        mode: "comparison",
        matchedAutomationIds: [automationId],
        sideEffectsExecuted: false,
      },
    })
  })
})
