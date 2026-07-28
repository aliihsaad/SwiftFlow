import { describe, expect, it, vi } from "vitest"

import { ActionExecutor } from "@/lib/automation/action-executor"
import type { ActionOutboxRecord } from "@/lib/automation/action-outbox-contract"
import type {
  ActionFinalizeResult,
  ActionOutboxRepository,
} from "@/lib/automation/postgres-action-outbox"
import type { ActionExecutorConfig, ExecutorAccount } from "@/lib/automation/action-safety-gates"
import {
  META_INSTAGRAM_GRAPH_HOST,
  META_PRIVATE_REPLY_API_VERSION,
  createMetaPrivateReplyAdapter,
  describeRequestShape,
} from "@/lib/automation/meta-private-reply-adapter"
import { resolveProviderActionAdapter } from "@/lib/automation/provider-action-adapter"

const TOKEN = "IGAA-super-secret-token-value-do-not-log"
const ACCOUNT = "17841478478450461"

function record(overrides: Partial<ActionOutboxRecord> = {}): ActionOutboxRecord {
  return {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    identity: {
      provider: "meta",
      providerEventKey: "instagram:acct:change:comments:c1",
      automationId: "bbbbbbbb-2222-4222-8222-222222222222",
      workflowVersionId: "wfv1",
      nodeId: "reply-node",
      actionType: "action_private_reply",
      targetId: "comment-123",
    },
    workspaceId: "cccccccc-3333-4333-8333-333333333333",
    socialAccountId: "dddddddd-4444-4444-8444-444444444444",
    payload: { message: "Thanks! Sending details.", authorExternalId: "commenter-1" },
    status: "claimed",
    attemptCount: 1,
    maxAttempts: 5,
    lockedBy: "w1",
    lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

const credentials = { accessToken: TOKEN, externalAccountId: ACCOUNT }

/** Records every request without ever retaining the Authorization header. */
function recordingFetch(responder: (url: string, init: RequestInit) => Response) {
  const requests: Array<{ url: string; method: string; body: unknown; headerNames: string[] }> = []

  const impl = vi.fn(async (url: unknown, init: unknown) => {
    const request = init as RequestInit
    requests.push({
      url: String(url),
      method: String(request.method),
      body: JSON.parse(String(request.body)),
      headerNames: Object.keys(request.headers as Record<string, string>).sort(),
    })
    return responder(String(url), request)
  })

  return { impl: impl as unknown as typeof fetch, requests }
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

describe("meta private reply adapter - endpoint contract", () => {
  it("posts to the documented Instagram Login endpoint with Bearer auth", async () => {
    const fetcher = recordingFetch(() =>
      jsonResponse(200, { recipient_id: "ig-scoped-1", message_id: "mid.123" }))
    const adapter = createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(true)
    const request = fetcher.requests[0]!
    expect(request.method).toBe("POST")
    expect(request.url).toBe(
      `${META_INSTAGRAM_GRAPH_HOST}/${META_PRIVATE_REPLY_API_VERSION}/${ACCOUNT}/messages`,
    )
    expect(request.body).toEqual({
      recipient: { comment_id: "comment-123" },
      message: { text: "Thanks! Sending details." },
    })
    expect(request.headerNames).toContain("authorization")
  })

  it("never places the token in the URL or the body", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, { message_id: "mid.1" }))
    const adapter = createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl })

    await adapter.send(record(), credentials)

    const request = fetcher.requests[0]!
    expect(request.url).not.toContain(TOKEN)
    expect(request.url).not.toContain("access_token")
    expect(JSON.stringify(request.body)).not.toContain(TOKEN)
  })

  it("returns only redacted identifiers from a success response", async () => {
    const adapter = createMetaPrivateReplyAdapter({
      fetchImpl: recordingFetch(() => jsonResponse(200, {
        recipient_id: "ig-scoped-1",
        message_id: "mid.abc",
        debug_access_token: TOKEN,
        echoed_request: { authorization: `Bearer ${TOKEN}` },
      })).impl,
    })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.providerResponseId).toBe("mid.abc")
    expect(outcome.response).toEqual({ recipient_id: "ig-scoped-1", message_id: "mid.abc" })
    expect(JSON.stringify(outcome.response)).not.toContain(TOKEN)
  })

  it("describes a sanitized request shape with no identifiers", () => {
    const shape = describeRequestShape(record())
    expect(shape.urlShape).toContain("{ig-user-id}")
    expect(shape.urlShape).not.toContain(ACCOUNT)
    expect(JSON.stringify(shape)).not.toContain(TOKEN)
    expect(shape.hasAuthorizationHeader).toBe(true)
  })
})

describe("meta private reply adapter - failure classification", () => {
  it("surfaces Retry-After on a rate-limit response", async () => {
    const adapter = createMetaPrivateReplyAdapter({
      fetchImpl: recordingFetch(() =>
        jsonResponse(429, { error: { code: 4, message: "rate limited" } }, { "retry-after": "37" })).impl,
    })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.status).toBe(429)
    expect(outcome.failure.retryAfterSeconds).toBe(37)
    expect(outcome.failure.ambiguous).toBeFalsy()
  })

  it("passes through terminal provider codes", async () => {
    const adapter = createMetaPrivateReplyAdapter({
      fetchImpl: recordingFetch(() =>
        jsonResponse(400, { error: { code: 190, message: "token expired" } })).impl,
    })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.code).toBe("190")
    expect(outcome.failure.status).toBe(400)
  })

  it("marks a timeout as ambiguous so it is never auto-retried", async () => {
    const adapter = createMetaPrivateReplyAdapter({
      timeoutMs: 5,
      fetchImpl: (async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
        })) as unknown as typeof fetch,
    })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.code).toBe("request_timeout")
    expect(outcome.failure.ambiguous).toBe(true)
  })

  it("marks a mid-flight network failure as ambiguous", async () => {
    const adapter = createMetaPrivateReplyAdapter({
      fetchImpl: (async () => {
        throw new Error("socket hang up")
      }) as unknown as typeof fetch,
    })

    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.ambiguous).toBe(true)
  })

  it("rejects a malformed payload without contacting the provider", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, {}))
    const adapter = createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl })

    const outcome = await adapter.send(record({ payload: { message: "   " } }), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.code).toBe("invalid_action_payload")
    expect(fetcher.requests).toHaveLength(0)
  })

  it("refuses an action type it does not own", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, {}))
    const adapter = createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl })

    const outcome = await adapter.send(
      record({ identity: { ...record().identity, actionType: "action_send_email" } }),
      credentials,
    )

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.code).toBe("unsupported_action_type")
    expect(fetcher.requests).toHaveLength(0)
  })
})

describe("adapter selection is gated by the kill switch", () => {
  it("returns the disabled adapter and never builds the real one when off", () => {
    const build = vi.fn(() => createMetaPrivateReplyAdapter())

    const adapter = resolveProviderActionAdapter(false, build)

    expect(build).not.toHaveBeenCalled()
    expect(adapter.name).toBe("disabled")
  })

  it("builds the real adapter only when provider actions are enabled", () => {
    const adapter = resolveProviderActionAdapter(true, () => createMetaPrivateReplyAdapter())
    expect(adapter.name).toBe("meta-instagram-private-reply")
  })

  it("cannot send through the disabled adapter even with a valid record", async () => {
    const adapter = resolveProviderActionAdapter(false, () => createMetaPrivateReplyAdapter())
    const outcome = await adapter.send(record(), credentials)

    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.failure.code).toBe("provider_adapter_disabled")
  })
})

describe("full executor rehearsal with the real adapter and a recording transport", () => {
  function account(overrides: Partial<ExecutorAccount> = {}): ExecutorAccount {
    return {
      socialAccountId: "dddddddd-4444-4444-8444-444444444444",
      externalAccountId: ACCOUNT,
      accessToken: TOKEN,
      metadata: {
        permissions: ["instagram_business_basic", "instagram_business_manage_comments"],
      },
      ...overrides,
    }
  }

  function config(overrides: Partial<ActionExecutorConfig> = {}): ActionExecutorConfig {
    return {
      providerActionsEnabled: true,
      allowlist: [ACCOUNT],
      maxActionsPerAccount: 10,
      rateWindowMs: 60_000,
      workerId: "rehearsal",
      batchSize: 5,
      leaseSeconds: 60,
      pollIntervalMs: 100,
      runOnce: true,
      ...overrides,
    }
  }

  function repository(toClaim: ActionOutboxRecord[]) {
    const state = {
      completed: [] as string[],
      failed: [] as { code: string; deadLetter: boolean }[],
      suppressed: [] as string[],
    }
    const ok: ActionFinalizeResult = { updated: true, status: "ok" }
    const repo: ActionOutboxRepository = {
      async enqueue() {
        return { total: 0, inserted: 0, duplicates: 0 }
      },
      async claim() {
        return toClaim
      },
      async complete(id) {
        state.completed.push(id)
        return ok
      },
      async fail(_id, _w, failure) {
        state.failed.push({ code: failure.code, deadLetter: failure.deadLetter })
        return ok
      },
      async suppress(_id, _w, reason) {
        state.suppressed.push(reason)
        return ok
      },
      async extendLease() {
        return true
      },
    }
    return { repo, state }
  }

  function lookup(resolved: ExecutorAccount | null, isActive = true) {
    return {
      async findAccount() {
        return resolved
      },
      async findAutomation(id: string) {
        return { id, isActive }
      },
    }
  }

  it("sends once through the documented endpoint when every gate passes", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, { message_id: "mid.rehearsal" }))
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
    })

    const run = await executor.runOnce()

    expect(run.sent).toBe(1)
    expect(fetcher.requests).toHaveLength(1)
    expect(state.completed).toHaveLength(1)
  })

  it("makes no request at all when the kill switch is off", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, {}))
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config({ providerActionsEnabled: false }),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
    })

    await executor.runOnce()

    expect(fetcher.requests).toHaveLength(0)
    expect(state.suppressed).toEqual(["provider_actions_disabled"])
  })

  it("makes no request for a non-allowlisted account or a self-authored event", async () => {
    for (const [cfg, rec, expected] of [
      [config({ allowlist: ["999"] }), record(), "account_not_allowlisted"],
      [config(), record({ payload: { message: "x", authorExternalId: ACCOUNT } }), "self_authored_event"],
    ] as const) {
      const fetcher = recordingFetch(() => jsonResponse(200, {}))
      const { repo, state } = repository([rec])
      const executor = new ActionExecutor({
        config: cfg,
        repository: repo,
        lookup: lookup(account()),
        adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
      })

      await executor.runOnce()

      expect(fetcher.requests).toHaveLength(0)
      expect(state.suppressed).toEqual([expected])
    }
  })

  it("blocks the send when the comment permission is missing", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, {}))
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account({ metadata: { permissions: ["instagram_business_basic"] } })),
      adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
    })

    await executor.runOnce()

    expect(fetcher.requests).toHaveLength(0)
    expect(state.suppressed[0]).toBe("missing_permission:instagram_business_manage_comments")
  })

  it("dead-letters an ambiguous timeout instead of retrying into a duplicate reply", async () => {
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({
        timeoutMs: 5,
        fetchImpl: (async (_u: string, init: RequestInit) =>
          new Promise((_r, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")))
          })) as unknown as typeof fetch,
      }),
    })

    const run = await executor.runOnce()

    expect(run.retryScheduled).toBe(0)
    expect(run.deadLettered).toBe(1)
    expect(state.failed[0]).toMatchObject({ code: "request_timeout", deadLetter: true })
  })

  it("schedules a retry for a rate limit but not a duplicate send", async () => {
    const fetcher = recordingFetch(() =>
      jsonResponse(429, { error: { code: 4 } }, { "retry-after": "12" }))
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
    })

    const run = await executor.runOnce()

    expect(run.retryScheduled).toBe(1)
    expect(fetcher.requests).toHaveLength(1)
    expect(state.failed[0]!.deadLetter).toBe(false)
  })

  it("stays safe when the adapter is pointed at a misconfigured host", async () => {
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({
        host: "https://not-meta.invalid",
        fetchImpl: (async () => {
          throw new Error("ENOTFOUND not-meta.invalid")
        }) as unknown as typeof fetch,
      }),
    })

    const run = await executor.runOnce()

    // Ambiguous, so held for reconciliation rather than replayed.
    expect(run.deadLettered).toBe(1)
    expect(state.completed).toHaveLength(0)
  })

  it("records no authorization header or token anywhere in the rehearsal", async () => {
    const fetcher = recordingFetch(() => jsonResponse(200, { message_id: "mid.x" }))
    const { repo, state } = repository([record()])
    const executor = new ActionExecutor({
      config: config(),
      repository: repo,
      lookup: lookup(account()),
      adapter: createMetaPrivateReplyAdapter({ fetchImpl: fetcher.impl }),
    })

    await executor.runOnce()

    const serialized = JSON.stringify({ requests: fetcher.requests, state })
    expect(serialized).not.toContain(TOKEN)
    expect(serialized).not.toContain("Bearer")
  })
})
