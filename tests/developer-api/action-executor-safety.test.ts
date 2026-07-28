import { describe, expect, it } from "vitest"

import {
  ActionExecutor,
  type ExecutorLookup,
} from "@/lib/automation/action-executor"
import {
  buildProviderActionIdentityKey,
  deriveWorkflowVersionId,
  type ActionOutboxRecord,
} from "@/lib/automation/action-outbox-contract"
import {
  AccountRateLimiter,
  resolveActionExecutorConfig,
  type ActionExecutorConfig,
  type ExecutorAccount,
} from "@/lib/automation/action-safety-gates"
import {
  classifyProviderFailure,
  decideRetry,
  redactProviderError,
  resolveRetryDelayMs,
} from "@/lib/automation/action-retry-policy"
import type {
  ActionFinalizeResult,
  ActionOutboxRepository,
} from "@/lib/automation/postgres-action-outbox"
import {
  createDisabledProviderActionAdapter,
  createRecordingProviderActionAdapter,
} from "@/lib/automation/provider-action-adapter"

const ACCOUNT_ID = "17841478478450461"

function record(overrides: Partial<ActionOutboxRecord> = {}): ActionOutboxRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    identity: {
      provider: "meta",
      providerEventKey: "instagram:acct:change:comments:c1",
      automationId: "22222222-2222-4222-8222-222222222222",
      workflowVersionId: "v1",
      nodeId: "reply-node",
      actionType: "action_private_reply",
      targetId: "comment-1",
    },
    workspaceId: "33333333-3333-4333-8333-333333333333",
    socialAccountId: "44444444-4444-4444-8444-444444444444",
    payload: { message: "hi", authorExternalId: "someone-else" },
    status: "claimed",
    attemptCount: 1,
    maxAttempts: 5,
    lockedBy: "test-worker",
    lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

function account(overrides: Partial<ExecutorAccount> = {}): ExecutorAccount {
  return {
    socialAccountId: "44444444-4444-4444-8444-444444444444",
    externalAccountId: ACCOUNT_ID,
    accessToken: "a-real-looking-token",
    // Private replies are authorised by the COMMENT permissions per Meta's
    // private-replies documentation, not the messaging ones.
    metadata: {
      permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
    },
    ...overrides,
  }
}

function config(overrides: Partial<ActionExecutorConfig> = {}): ActionExecutorConfig {
  return {
    providerActionsEnabled: true,
    allowlist: [ACCOUNT_ID],
    maxActionsPerAccount: 5,
    rateWindowMs: 60_000,
    workerId: "test-worker",
    batchSize: 3,
    leaseSeconds: 60,
    pollIntervalMs: 1_000,
    runOnce: true,
    ...overrides,
  }
}

interface FakeRepositoryState {
  claimed: ActionOutboxRecord[]
  completed: { id: string; providerResponseId: string | null }[]
  failed: { id: string; code: string; deadLetter: boolean; retryAt: Date }[]
  suppressed: { id: string; reason: string }[]
}

function fakeRepository(
  toClaim: ActionOutboxRecord[],
  finalize: ActionFinalizeResult = { updated: true, status: "ok" },
): ActionOutboxRepository & { state: FakeRepositoryState } {
  const state: FakeRepositoryState = { claimed: [], completed: [], failed: [], suppressed: [] }

  return {
    state,
    async enqueue() {
      return { total: 0, inserted: 0, duplicates: 0 }
    },
    async claim() {
      state.claimed.push(...toClaim)
      return toClaim
    },
    async complete(id, _worker, providerResponseId) {
      state.completed.push({ id, providerResponseId })
      return finalize
    },
    async fail(id, _worker, failure) {
      state.failed.push({
        id,
        code: failure.code,
        deadLetter: failure.deadLetter,
        retryAt: failure.retryAt,
      })
      return finalize
    },
    async suppress(id, _worker, reason) {
      state.suppressed.push({ id, reason })
      return finalize
    },
    async extendLease() {
      return true
    },
  }
}

function lookup(
  resolvedAccount: ExecutorAccount | null,
  isActive = true,
): ExecutorLookup {
  return {
    async findAccount() {
      return resolvedAccount
    },
    async findAutomation(automationId) {
      return { id: automationId, isActive }
    },
  }
}

describe("provider action identity", () => {
  it("is stable for the same logical action and changes with any component", () => {
    const base = record().identity
    const key = buildProviderActionIdentityKey(base)

    expect(buildProviderActionIdentityKey({ ...base })).toBe(key)
    expect(buildProviderActionIdentityKey({ ...base, targetId: "comment-2" })).not.toBe(key)
    expect(buildProviderActionIdentityKey({ ...base, nodeId: "other" })).not.toBe(key)
    expect(buildProviderActionIdentityKey({ ...base, workflowVersionId: "v2" })).not.toBe(key)
    expect(buildProviderActionIdentityKey({ ...base, providerEventKey: "other" })).not.toBe(key)
  })

  it("derives a workflow version that ignores key order but tracks content", () => {
    const a = deriveWorkflowVersionId({ nodes: [{ id: "x", type: "t" }], edges: [] })
    const b = deriveWorkflowVersionId({ edges: [], nodes: [{ type: "t", id: "x" }] })
    const c = deriveWorkflowVersionId({ nodes: [{ id: "y", type: "t" }], edges: [] })

    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe("kill switch and gates", () => {
  it("defaults to disabled when the environment says nothing", () => {
    expect(resolveActionExecutorConfig({}).providerActionsEnabled).toBe(false)
    expect(resolveActionExecutorConfig({}).allowlist).toEqual([])
  })

  it("blocks every external call when the kill switch is off", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config({ providerActionsEnabled: false }),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    const run = await executor.runOnce()

    expect(adapter.calls).toHaveLength(0)
    expect(run.sent).toBe(0)
    expect(run.suppressed).toBe(1)
    expect(repository.state.suppressed[0]!.reason).toBe("provider_actions_disabled")
  })

  it("suppresses an account that is not allowlisted", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config({ allowlist: ["99999999999"] }),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    await executor.runOnce()

    expect(adapter.calls).toHaveLength(0)
    expect(repository.state.suppressed[0]!.reason).toBe("account_not_allowlisted")
  })

  it("suppresses when the allowlist is empty even if actions are enabled", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config({ allowlist: [] }),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    await executor.runOnce()

    expect(adapter.calls).toHaveLength(0)
    expect(repository.state.suppressed[0]!.reason).toBe("allowlist_empty")
  })

  it("suppresses when the automation is not active", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account(), false),
      adapter,
    })

    await executor.runOnce()

    expect(adapter.calls).toHaveLength(0)
    expect(repository.state.suppressed[0]!.reason).toBe("automation_not_active")
  })

  it("suppresses a self-authored event on either identifier", async () => {
    for (const payload of [
      { message: "hi", authorExternalId: ACCOUNT_ID },
      { message: "hi", authorScopedId: ACCOUNT_ID },
    ]) {
      const adapter = createRecordingProviderActionAdapter()
      const repository = fakeRepository([record({ payload })])
      const executor = new ActionExecutor({
        config: config(),
        repository,
        lookup: lookup(account()),
        adapter,
      })

      await executor.runOnce()

      expect(adapter.calls).toHaveLength(0)
      expect(repository.state.suppressed[0]!.reason).toBe("self_authored_event")
    }
  })

  it("suppresses a missing, placeholder, or expired token", async () => {
    const cases: Array<[Partial<ExecutorAccount>, string]> = [
      [{ accessToken: null }, "missing_access_token"],
      [{ accessToken: "placeholder-not-a-real-token" }, "placeholder_access_token"],
      [
        {
          metadata: {
            permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
            token_expires_at: new Date(Date.now() - 1_000).toISOString(),
          },
        },
        "access_token_expired",
      ],
    ]

    for (const [overrides, expected] of cases) {
      const adapter = createRecordingProviderActionAdapter()
      const repository = fakeRepository([record()])
      const executor = new ActionExecutor({
        config: config(),
        repository,
        lookup: lookup(account(overrides)),
        adapter,
      })

      await executor.runOnce()

      expect(adapter.calls).toHaveLength(0)
      expect(repository.state.suppressed[0]!.reason).toBe(expected)
    }
  })

  it("suppresses when the required permission was never granted", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account({ metadata: { permissions: ["instagram_business_basic"] } })),
      adapter,
    })

    await executor.runOnce()

    expect(adapter.calls).toHaveLength(0)
    expect(repository.state.suppressed[0]!.reason)
      .toBe("missing_permission:instagram_business_manage_comments")
  })

  it("rate limits per account within the window", async () => {
    const limiter = new AccountRateLimiter(1, 60_000)
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([
      record({ id: "a", identity: { ...record().identity, targetId: "c1" } }),
      record({ id: "b", identity: { ...record().identity, targetId: "c2" } }),
    ])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter,
      rateLimiter: limiter,
    })

    const run = await executor.runOnce()

    expect(adapter.calls).toHaveLength(1)
    expect(run.sent).toBe(1)
    expect(repository.state.suppressed[0]!.reason).toBe("rate_limited")
  })

  it("sends exactly once when every gate passes", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    const run = await executor.runOnce()

    expect(adapter.calls).toHaveLength(1)
    expect(adapter.calls[0]).toMatchObject({
      actionType: "action_private_reply",
      targetId: "comment-1",
      usedAccessToken: true,
    })
    expect(run.sent).toBe(1)
    expect(repository.state.completed).toHaveLength(1)
  })

  it("never sends through the default disabled adapter", async () => {
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter: createDisabledProviderActionAdapter(),
    })

    const run = await executor.runOnce()

    expect(run.sent).toBe(0)
    expect(run.deadLettered).toBe(1)
  })
})

describe("retry classification", () => {
  it("treats throttling, timeouts and 5xx as retryable", () => {
    expect(classifyProviderFailure({ status: 429 })).toBe("retryable")
    expect(classifyProviderFailure({ status: 500 })).toBe("retryable")
    expect(classifyProviderFailure({ status: 503 })).toBe("retryable")
    expect(classifyProviderFailure({ status: 408 })).toBe("retryable")
    expect(classifyProviderFailure({})).toBe("retryable")
    expect(classifyProviderFailure({ code: "4" })).toBe("retryable")
  })

  it("treats invalid token, missing permission and bad target as terminal", () => {
    expect(classifyProviderFailure({ code: "190" })).toBe("terminal")
    expect(classifyProviderFailure({ code: "200" })).toBe("terminal")
    expect(classifyProviderFailure({ code: "803" })).toBe("terminal")
    expect(classifyProviderFailure({ status: 400 })).toBe("terminal")
    expect(classifyProviderFailure({ status: 403 })).toBe("terminal")
  })

  it("honours Retry-After over computed backoff", () => {
    expect(resolveRetryDelayMs(1, { status: 429, retryAfterSeconds: 42 })).toBe(42_000)
  })

  it("grows backoff with jitter and stays bounded", () => {
    const options = { baseMs: 1_000, maxMs: 10_000, random: () => 1 }
    expect(resolveRetryDelayMs(1, {}, options)).toBe(1_200)
    expect(resolveRetryDelayMs(2, {}, options)).toBe(2_400)
    expect(resolveRetryDelayMs(99, {}, options)).toBe(10_000)
  })

  it("stops retrying once the budget is exhausted", () => {
    expect(decideRetry(5, 5, { status: 500 })).toMatchObject({
      retryable: false,
      reason: "retry_budget_exhausted",
    })
  })

  it("redacts tokens and secrets from provider errors", () => {
    const redacted = redactProviderError(
      'failed access_token=EAAaaaaaaaaaaaaaaaaaa and Authorization: Bearer EAAbbbbbbbbbbbbbb',
    )
    expect(redacted).not.toMatch(/EAAaaaaaaaaaaaaaaaaaa/)
    expect(redacted).not.toMatch(/EAAbbbbbbbbbbbbbb/)
    expect(redacted).toContain("[redacted")
  })
})

describe("executor failure handling", () => {
  it("schedules a retry without duplicating the logical action", async () => {
    const adapter = createRecordingProviderActionAdapter()
    adapter.enqueueOutcome({ ok: false, failure: { status: 500, message: "upstream" } })
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    const run = await executor.runOnce()

    expect(run.retryScheduled).toBe(1)
    expect(run.deadLettered).toBe(0)
    expect(repository.state.failed[0]!.deadLetter).toBe(false)
    // One claim, one attempted send, one row - no second action was created.
    expect(adapter.calls).toHaveLength(1)
    expect(repository.state.completed).toHaveLength(0)
  })

  it("dead-letters a terminal provider error", async () => {
    const adapter = createRecordingProviderActionAdapter()
    adapter.enqueueOutcome({ ok: false, failure: { status: 400, code: "100", message: "bad target" } })
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    const run = await executor.runOnce()

    expect(run.deadLettered).toBe(1)
    expect(repository.state.failed[0]!.deadLetter).toBe(true)
  })

  it("treats a thrown adapter error as ambiguous and refuses to auto-retry it", async () => {
    const repository = fakeRepository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter: {
        name: "throwing",
        async send() {
          throw new Error("socket hang up access_token=EAAsecretvalue123456")
        },
      },
    })

    const run = await executor.runOnce()

    // A private reply is not idempotent at the provider, so an unknown outcome
    // is held for reconciliation rather than replayed into a possible duplicate.
    expect(run.retryScheduled).toBe(0)
    expect(run.deadLettered).toBe(1)
    expect(repository.state.failed[0]!.deadLetter).toBe(true)
    expect(repository.state.failed[0]!.code).toBeTruthy()
    expect(JSON.stringify(repository.state.failed[0])).not.toContain("EAAsecretvalue123456")
  })

  it("counts a lost lease instead of double-reporting a send", async () => {
    const adapter = createRecordingProviderActionAdapter()
    const repository = fakeRepository([record()], { updated: false, status: "lost_lease" })
    const executor = new ActionExecutor({
      config: config(),
      repository,
      lookup: lookup(account()),
      adapter,
    })

    const run = await executor.runOnce()

    expect(run.sent).toBe(0)
    expect(run.lostLease).toBe(1)
  })
})
