import { randomUUID } from "node:crypto"

import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { ActionExecutor } from "@/lib/automation/action-executor"
import type { ProviderActionRequest } from "@/lib/automation/action-outbox-contract"
import type { ActionExecutorConfig } from "@/lib/automation/action-safety-gates"
import { PostgresActionOutboxRepository } from "@/lib/automation/postgres-action-outbox"
import { createRecordingProviderActionAdapter } from "@/lib/automation/provider-action-adapter"
import { createPostgresQueryClient } from "@/lib/webhooks/postgres-inbox-repository"

function requireLocalTestDatabaseUrl(variableName: string): string {
  const value = process.env[variableName]?.trim()
  if (!value) throw new Error(`${variableName} is required`)

  const url = new URL(value)
  const databaseName = url.pathname.replace(/^\//, "")
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"])
  if (!localHosts.has(url.hostname) || !databaseName.toLowerCase().includes("test")) {
    throw new Error("PostgreSQL integration tests require a local database with 'test' in its name")
  }
  return value
}

const WORKSPACE_ID = "50000000-0000-4000-8000-000000000001"
const ACCOUNT_ID = "50000000-0000-4000-8000-000000000002"
const AUTOMATION_ID = "50000000-0000-4000-8000-000000000003"
const EXTERNAL_ACCOUNT = "17841478478450461"

let adminPool: Pool
let comparisonPool: Pool
let executorPool: Pool

function request(overrides: Partial<ProviderActionRequest["identity"]> = {}): ProviderActionRequest {
  return {
    identity: {
      provider: "meta",
      providerEventKey: "instagram:acct:change:comments:comment-1",
      automationId: AUTOMATION_ID,
      workflowVersionId: "wfv1",
      nodeId: "reply-node",
      actionType: "action_private_reply",
      targetId: "comment-1",
      ...overrides,
    },
    workspaceId: WORKSPACE_ID,
    socialAccountId: ACCOUNT_ID,
    payload: { message: "hello", authorExternalId: "someone-else" },
  }
}

function config(overrides: Partial<ActionExecutorConfig> = {}): ActionExecutorConfig {
  return {
    providerActionsEnabled: true,
    allowlist: [EXTERNAL_ACCOUNT],
    maxActionsPerAccount: 50,
    rateWindowMs: 60_000,
    workerId: "integration-executor",
    batchSize: 10,
    leaseSeconds: 60,
    pollIntervalMs: 100,
    runOnce: true,
    ...overrides,
  }
}

function executorLookup() {
  return {
    async findAccount() {
      return {
        socialAccountId: ACCOUNT_ID,
        externalAccountId: EXTERNAL_ACCOUNT,
        accessToken: "an-integration-token",
        // Private replies are authorised by the comment permissions.
        metadata: {
          permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
        },
      }
    },
    async findAutomation(automationId: string) {
      return { id: automationId, isActive: true }
    },
  }
}

async function outboxRows(): Promise<Record<string, unknown>[]> {
  const result = await adminPool.query(`
    select provider_event_key, target_id, status, attempt_count,
           provider_response_id, suppressed_reason, last_error_code
    from public.automation_action_outbox
    order by created_at
  `)
  return result.rows
}

beforeAll(async () => {
  adminPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_DATABASE_URL"),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  comparisonPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_WORKER_DATABASE_URL"),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  executorPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_EXECUTOR_DATABASE_URL"),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  await adminPool.query("select 1")
})

beforeEach(async () => {
  await adminPool.query(`
    truncate table
      public.automation_action_outbox,
      public.webhook_inbox_events,
      public.automations,
      public.social_accounts,
      public.workspaces
    restart identity cascade
  `)
  await adminPool.query(
    `insert into public.workspaces (id, name) values ($1, 'Outbox integration')`,
    [WORKSPACE_ID],
  )
  await adminPool.query(`
    insert into public.social_accounts (id, workspace_id, platform, account_id, access_token, metadata)
    values ($1, $2, 'instagram', $3, 'integration-token', '{}'::jsonb)
  `, [ACCOUNT_ID, WORKSPACE_ID, EXTERNAL_ACCOUNT])
  await adminPool.query(`
    insert into public.automations (id, workspace_id, social_account_id, is_active, editor_version, workflow_graph)
    values ($1, $2, $3, true, 'canvas', '{"nodes":[],"edges":[]}'::jsonb)
  `, [AUTOMATION_ID, WORKSPACE_ID, ACCOUNT_ID])
})

afterAll(async () => {
  await adminPool?.end()
  await comparisonPool?.end()
  await executorPool?.end()
})

describe("action outbox idempotency", () => {
  it("stores one row when the same webhook is delivered twice", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))

    const first = await repository.enqueue([request()])
    const replay = await repository.enqueue([request()])

    expect(first).toEqual({ total: 1, inserted: 1, duplicates: 0 })
    expect(replay).toEqual({ total: 1, inserted: 0, duplicates: 1 })
    expect(await outboxRows()).toHaveLength(1)
  })

  it("collapses identities repeated inside a single batch", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))

    const result = await repository.enqueue([request(), request(), request({ targetId: "comment-2" })])

    expect(result).toEqual({ total: 3, inserted: 2, duplicates: 1 })
    expect(await outboxRows()).toHaveLength(2)
  })

  it("treats a different node or workflow version as a distinct action", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))

    await repository.enqueue([request()])
    await repository.enqueue([request({ nodeId: "other-node" })])
    await repository.enqueue([request({ workflowVersionId: "wfv2" })])

    expect(await outboxRows()).toHaveLength(3)
  })

  it("relies on a single unique constraint, so untargeted DO NOTHING is unambiguous", async () => {
    const result = await adminPool.query<{ conname: string; contype: string }>(`
      select conname, contype from pg_constraint
      where conrelid = 'public.automation_action_outbox'::regclass
        and contype in ('p','u','x')
      order by conname
    `)

    expect(result.rows.map((row) => `${row.contype}:${row.conname}`).sort()).toEqual([
      "p:automation_action_outbox_pkey",
      "u:automation_action_outbox_identity_unique",
    ].sort())
  })
})

describe("duplicate delivery cannot cause a duplicate provider send", () => {
  it("sends once even though the event was enqueued twice and executed twice", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))
    const adapter = createRecordingProviderActionAdapter()

    await repository.enqueue([request()])
    await repository.enqueue([request()])

    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: executorLookup(),
      adapter,
    })

    const firstRun = await executor.runOnce()
    const secondRun = await executor.runOnce()

    expect(adapter.calls).toHaveLength(1)
    expect(firstRun.sent).toBe(1)
    expect(secondRun.claimed).toBe(0)

    const rows = await outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "succeeded", attempt_count: 1 })
  })
})

describe("crash recovery", () => {
  it("re-claims work whose lease expired and still sends only once", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))
    await repository.enqueue([request()])

    // Claim with a short lease and then abandon it, as a crashed worker would.
    const claimed = await repository.claim("crashed-worker", 5, 1)
    expect(claimed).toHaveLength(1)
    await adminPool.query(
      `update public.automation_action_outbox set lock_expires_at = now() - interval '1 second'`,
    )

    const adapter = createRecordingProviderActionAdapter()
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: executorLookup(),
      adapter,
    })
    const run = await executor.runOnce()

    expect(run.claimed).toBe(1)
    expect(adapter.calls).toHaveLength(1)

    const rows = await outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: "succeeded", attempt_count: 2 })
  })

  it("dead-letters when the lease expires after the final permitted attempt", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))
    await repository.enqueue([request()])
    await adminPool.query(`
      update public.automation_action_outbox
      set status = 'claimed', attempt_count = max_attempts,
          locked_by = 'crashed', lock_expires_at = now() - interval '1 second'
    `)

    await repository.claim("recovering-worker", 5, 30)

    const rows = await outboxRows()
    expect(rows[0]).toMatchObject({
      status: "dead_lettered",
      last_error_code: "lease_expired_after_final_attempt",
    })
  })
})

describe("comparison-path enqueueing through the insert-only role", () => {
  const SUPPORTED_GRAPH = {
    nodes: [
      {
        id: "trigger",
        data: {
          type: "trigger_new_comment",
          config: { trigger_type: "keywords", keywords: ["swiftflow"], post_scope: "any" },
        },
      },
      {
        id: "reply",
        data: { type: "action_private_reply", config: { message: "Details sent." } },
      },
    ],
    edges: [{ source: "trigger", target: "reply" }],
  }

  function commentEvent(commentId: string) {
    return {
      id: "irrelevant",
      provider: "meta",
      providerEventKey: `instagram:${EXTERNAL_ACCOUNT}:change:comments:${commentId}`,
      providerObject: "instagram",
      eventType: "comments",
      workspaceId: null,
      socialAccountId: null,
      accountExternalId: EXTERNAL_ACCOUNT,
      deliveryHash: "f".repeat(64),
      payload: {
        change: {
          field: "comments",
          value: {
            id: commentId,
            text: "does swiftflow do this?",
            from: { id: "commenter-9", username: "someone", self_ig_scoped_id: "scoped-9" },
            media: { id: "post-9", media_product_type: "FEED" },
          },
        },
      },
      status: "processing" as const,
      attemptCount: 1,
      maxAttempts: 5,
      lockedBy: "w",
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      receivedAt: new Date().toISOString(),
    }
  }

  async function runComparison(commentId: string, accountId = EXTERNAL_ACCOUNT) {
    const { createCommentPrivateReplyComparisonHandler } =
      await import("@/lib/webhooks/comment-private-reply-comparison")

    // The real insert-only comparison role, not the admin connection.
    const handler = createCommentPrivateReplyComparisonHandler(
      {
        async findAccountAndAutomations() {
          return {
            workspaceId: WORKSPACE_ID,
            socialAccountId: ACCOUNT_ID,
            accountId,
            connectedPageId: null,
            automations: [{
              id: AUTOMATION_ID,
              socialAccountId: ACCOUNT_ID,
              workflowGraph: SUPPORTED_GRAPH,
            }],
          }
        },
      },
      {
        actionOutbox: new PostgresActionOutboxRepository(
          createPostgresQueryClient(comparisonPool),
        ),
      },
    )

    return handler(commentEvent(commentId), { async heartbeat() { return true } })
  }

  it("creates exactly one action for a supported matched comment", async () => {
    const result = await runComparison("real-comment-1")

    expect(result.outcome).toBe("succeeded")
    expect(result.result).toMatchObject({ enqueuedActions: 1, sideEffectsExecuted: false })

    const rows = await outboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ target_id: "real-comment-1", status: "pending" })
  })

  it("creates no second action when the same event is reprocessed", async () => {
    await runComparison("real-comment-1")
    const replay = await runComparison("real-comment-1")
    const secondReplay = await runComparison("real-comment-1")

    expect(await outboxRows()).toHaveLength(1)
    expect(replay.result).toMatchObject({ enqueuedActions: 0, duplicateActions: 1 })
    expect(secondReplay.result).toMatchObject({ enqueuedActions: 0, duplicateActions: 1 })
  })

  it("creates nothing for a non-matching comment", async () => {
    const { createCommentPrivateReplyComparisonHandler } =
      await import("@/lib/webhooks/comment-private-reply-comparison")
    const handler = createCommentPrivateReplyComparisonHandler(
      {
        async findAccountAndAutomations() {
          return {
            workspaceId: WORKSPACE_ID,
            socialAccountId: ACCOUNT_ID,
            accountId: EXTERNAL_ACCOUNT,
            connectedPageId: null,
            automations: [{
              id: AUTOMATION_ID,
              socialAccountId: ACCOUNT_ID,
              workflowGraph: SUPPORTED_GRAPH,
            }],
          }
        },
      },
      {
        actionOutbox: new PostgresActionOutboxRepository(
          createPostgresQueryClient(comparisonPool),
        ),
      },
    )

    const event = commentEvent("real-comment-2")
    const change = event.payload.change as unknown as {
      value: { text: string }
    }
    change.value.text = "unrelated"

    await handler(event, { async heartbeat() { return true } })
    expect(await outboxRows()).toHaveLength(0)
  })

  it("creates nothing for a self-authored comment", async () => {
    // The connected account is the comment author.
    const result = await runComparison("real-comment-3", "commenter-9")

    expect(result.outcome).toBe("ignored")
    expect(await outboxRows()).toHaveLength(0)
  })

  it("writes no credential into the stored payload", async () => {
    await runComparison("real-comment-4")

    const result = await adminPool.query(
      "select action_payload::text as payload from public.automation_action_outbox",
    )
    expect(result.rows[0]!.payload).not.toMatch(/token|secret|authorization|bearer/i)
  })
})

describe("database role separation", () => {
  it("lets the comparison role append but never read, mutate, or claim", async () => {
    await expect(comparisonPool.query(`
      insert into public.automation_action_outbox (
        provider, provider_event_key, automation_id, workflow_version_id,
        node_id, action_type, target_id, workspace_id, social_account_id, action_payload
      ) values ('meta', $1, $2, 'wfv1', 'n1', 'action_private_reply', 'c1', $3, $4, '{}'::jsonb)
      on conflict do nothing
    `, [`evt-${randomUUID()}`, AUTOMATION_ID, WORKSPACE_ID, ACCOUNT_ID])).resolves.toBeDefined()

    await expect(comparisonPool.query("select id from public.automation_action_outbox"))
      .rejects.toThrow(/permission denied/i)
    await expect(comparisonPool.query(
      "update public.automation_action_outbox set status = 'succeeded'",
    )).rejects.toThrow(/permission denied/i)
    await expect(comparisonPool.query("delete from public.automation_action_outbox"))
      .rejects.toThrow(/permission denied/i)
    await expect(comparisonPool.query(
      "select * from public.claim_automation_actions('x', 1, 30)",
    )).rejects.toThrow(/permission denied/i)
  })

  it("keeps provider tokens away from the enqueueing roles", async () => {
    await expect(comparisonPool.query("select access_token from public.social_accounts"))
      .rejects.toThrow(/permission denied/i)
  })

  it("lets the executor role claim and read credentials but not append or delete", async () => {
    const repository = new PostgresActionOutboxRepository(createPostgresQueryClient(adminPool))
    await repository.enqueue([request()])

    await expect(executorPool.query("select access_token from public.social_accounts"))
      .resolves.toBeDefined()
    await expect(executorPool.query(
      "select * from public.claim_automation_actions('executor-role-test', 1, 30)",
    )).resolves.toBeDefined()

    await expect(executorPool.query(`
      insert into public.automation_action_outbox (
        provider, provider_event_key, automation_id, workflow_version_id,
        node_id, action_type, target_id
      ) values ('meta', 'x', $1, 'v', 'n', 'a', 't')
    `, [AUTOMATION_ID])).rejects.toThrow(/permission denied/i)
    await expect(executorPool.query("delete from public.automation_action_outbox"))
      .rejects.toThrow(/permission denied/i)
    await expect(executorPool.query("select refresh_token from public.social_accounts"))
      .rejects.toThrow(/permission denied/i)
  })
})
