import { describe, expect, it } from "vitest"

import type { ProviderActionRequest } from "@/lib/automation/action-outbox-contract"
import {
  MAX_ACTION_MESSAGE_LENGTH,
  planCommentPrivateReplyAction,
  type ActionPlanContext,
} from "@/lib/webhooks/comment-action-planner"
import {
  createCommentPrivateReplyComparisonHandler,
  type CommentComparisonAccount,
} from "@/lib/webhooks/comment-private-reply-comparison"
import type { WebhookInboxRecord } from "@/lib/webhooks/postgres-inbox-repository"

const TRIGGER = {
  id: "trigger",
  data: {
    type: "trigger_new_comment",
    config: { trigger_type: "keywords", keywords: ["swiftflow"], post_scope: "any" },
  },
}
const REPLY = {
  id: "reply",
  data: { type: "action_private_reply", config: { message: "Sent you the details." } },
}
const SUPPORTED_GRAPH = {
  nodes: [TRIGGER, REPLY],
  edges: [{ source: "trigger", target: "reply" }],
}
const WORKFLOW_VERSION_ID = "44444444-4444-4444-8444-444444444444"

function planContext(overrides: Partial<ActionPlanContext> = {}): ActionPlanContext {
  return {
    providerEventKey: "instagram:acct:change:comments:c1",
    automationId: "11111111-1111-4111-8111-111111111111",
    workflowVersionId: WORKFLOW_VERSION_ID,
    workflowGraph: SUPPORTED_GRAPH,
    matchedTriggerNodeId: "trigger",
    workspaceId: "22222222-2222-4222-8222-222222222222",
    socialAccountId: "33333333-3333-4333-8333-333333333333",
    commentId: "comment-1",
    authorExternalId: "author-1",
    authorScopedId: "scoped-1",
    postId: "post-1",
    ...overrides,
  }
}

describe("supported graph", () => {
  it("builds the full deterministic identity and a credential-free payload", () => {
    const plan = planCommentPrivateReplyAction(planContext())

    expect(plan.supported).toBe(true)
    if (!plan.supported) return

    expect(plan.request.identity).toMatchObject({
      provider: "meta",
      providerEventKey: "instagram:acct:change:comments:c1",
      automationId: "11111111-1111-4111-8111-111111111111",
      nodeId: "reply",
      actionType: "action_private_reply",
      targetId: "comment-1",
    })
    expect(plan.request.identity.workflowVersionId).toBe(WORKFLOW_VERSION_ID)

    expect(plan.request.payload).toEqual({
      message: "Sent you the details.",
      authorExternalId: "author-1",
      authorScopedId: "scoped-1",
      commentId: "comment-1",
      postId: "post-1",
      triggerNodeId: "trigger",
    })
    expect(JSON.stringify(plan.request.payload)).not.toMatch(
      /token|secret|authorization|bearer/i,
    )
  })

  it("bounds the message and strips control characters from identifiers", () => {
    const plan = planCommentPrivateReplyAction(planContext({
      workflowGraph: {
        nodes: [TRIGGER, {
          id: "reply",
          data: { type: "action_private_reply", config: { message: "x".repeat(5_000) } },
        }],
        edges: [{ source: "trigger", target: "reply" }],
      },
      commentId: `comment${String.fromCharCode(0)}-1`,
      authorExternalId: `author${String.fromCharCode(9)}1`,
    }))

    expect(plan.supported).toBe(true)
    if (!plan.supported) return
    expect((plan.request.payload.message as string).length).toBe(MAX_ACTION_MESSAGE_LENGTH)
    expect(plan.request.identity.targetId).toBe("comment-1")
    expect(plan.request.payload.authorExternalId).toBe("author1")
  })

  it("uses the immutable version row supplied with the stored graph", () => {
    const nextVersionId = "55555555-5555-4555-8555-555555555555"
    const a = planCommentPrivateReplyAction(planContext())
    const b = planCommentPrivateReplyAction(planContext({
      workflowVersionId: nextVersionId,
      workflowGraph: {
        nodes: [TRIGGER, {
          id: "reply",
          data: { type: "action_private_reply", config: { message: "Different copy." } },
        }],
        edges: [{ source: "trigger", target: "reply" }],
      },
    }))

    expect(a.supported && b.supported).toBe(true)
    if (!a.supported || !b.supported) return
    expect(a.request.identity.workflowVersionId).toBe(WORKFLOW_VERSION_ID)
    expect(b.request.identity.workflowVersionId).toBe(nextVersionId)
  })
})

describe("unsupported graphs enqueue nothing and say why", () => {
  const cases: Array<[string, Partial<ActionPlanContext>, string]> = [
    ["a branch from the trigger", {
      workflowGraph: {
        nodes: [TRIGGER, REPLY, { id: "other", data: { type: "action_send_email", config: {} } }],
        edges: [
          { source: "trigger", target: "reply" },
          { source: "trigger", target: "other" },
        ],
      },
    }, "trigger_branches"],

    ["a condition on the path", {
      workflowGraph: {
        nodes: [TRIGGER, REPLY, { id: "cond", data: { type: "action_condition", config: {} } }],
        edges: [
          { source: "trigger", target: "cond" },
          { source: "cond", target: "reply" },
        ],
      },
    }, "unsupported_node_on_path"],

    ["a delay on the path", {
      workflowGraph: {
        nodes: [TRIGGER, REPLY, { id: "delay", data: { type: "action_delay", config: {} } }],
        edges: [
          { source: "trigger", target: "delay" },
          { source: "delay", target: "reply" },
        ],
      },
    }, "unsupported_node_on_path"],

    ["two private reply actions", {
      workflowGraph: {
        nodes: [TRIGGER, REPLY, {
          id: "reply2",
          data: { type: "action_private_reply", config: { message: "second" } },
        }],
        edges: [{ source: "trigger", target: "reply" }],
      },
    }, "ambiguous_private_reply_actions"],

    ["an AI-generated reply", {
      workflowGraph: {
        nodes: [TRIGGER, {
          id: "reply",
          data: { type: "action_private_reply", config: { use_ai_response: true } },
        }],
        edges: [{ source: "trigger", target: "reply" }],
      },
    }, "ai_response_not_supported"],

    ["a templated message", {
      workflowGraph: {
        nodes: [TRIGGER, {
          id: "reply",
          data: { type: "action_private_reply", config: { message: "Hi {{ai_response}}" } },
        }],
        edges: [{ source: "trigger", target: "reply" }],
      },
    }, "ai_response_not_supported"],

    ["an unconfigured reply", {
      workflowGraph: {
        nodes: [TRIGGER, { id: "reply", data: { type: "action_private_reply", config: {} } }],
        edges: [{ source: "trigger", target: "reply" }],
      },
    }, "private_reply_not_configured"],

    ["work chained after the reply", {
      workflowGraph: {
        nodes: [TRIGGER, REPLY, { id: "after", data: { type: "action_send_email", config: {} } }],
        edges: [
          { source: "trigger", target: "reply" },
          { source: "reply", target: "after" },
        ],
      },
    }, "unsupported_node_on_path"],

    ["no action at all", {
      workflowGraph: { nodes: [TRIGGER], edges: [] },
    }, "trigger_has_no_action"],

    ["a missing comment id", { commentId: "" }, "missing_target_comment"],
    ["a missing workflow version", { workflowVersionId: "" }, "missing_workflow_version"],
  ]

  for (const [label, overrides, expectedReason] of cases) {
    it(`refuses ${label}`, () => {
      const plan = planCommentPrivateReplyAction(planContext(overrides))
      expect(plan.supported).toBe(false)
      if (plan.supported) return
      expect(plan.reason).toBe(expectedReason)
    })
  }
})

describe("comparison handler enqueueing", () => {
  /** The worker supplies a heartbeat; nothing here needs it to do anything. */
  function handlerContext() {
    return { async heartbeat() { return true } }
  }

  function inboxRecord(commentId = "comment-1", text = "does swiftflow work?"): WebhookInboxRecord {
    return {
      id: "event-1",
      provider: "meta",
      providerEventKey: `instagram:acct:change:comments:${commentId}`,
      providerObject: "instagram",
      eventType: "comments",
      workspaceId: null,
      socialAccountId: null,
      accountExternalId: "acct",
      deliveryHash: "a".repeat(64),
      payload: {
        change: {
          field: "comments",
          value: {
            id: commentId,
            text,
            from: { id: "author-1", username: "someone", self_ig_scoped_id: "scoped-1" },
            media: { id: "post-1", media_product_type: "FEED" },
          },
        },
      },
      status: "processing",
      attemptCount: 1,
      maxAttempts: 5,
      lockedBy: "w",
      lockExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      receivedAt: new Date().toISOString(),
    }
  }

  function account(graph: Record<string, unknown> = SUPPORTED_GRAPH): CommentComparisonAccount {
    return {
      workspaceId: "22222222-2222-4222-8222-222222222222",
      socialAccountId: "33333333-3333-4333-8333-333333333333",
      accountId: "acct",
      connectedPageId: null,
      automations: [{
        id: "11111111-1111-4111-8111-111111111111",
        socialAccountId: "33333333-3333-4333-8333-333333333333",
        workflowVersionId: WORKFLOW_VERSION_ID,
        workflowGraph: graph,
      }],
    }
  }

  function outbox() {
    const enqueued: ProviderActionRequest[][] = []
    return {
      enqueued,
      async enqueue(requests: ProviderActionRequest[]) {
        enqueued.push(requests)
        return { total: requests.length, inserted: requests.length, duplicates: 0 }
      },
    }
  }

  function duplicateOutbox() {
    const enqueued: ProviderActionRequest[][] = []
    return {
      enqueued,
      async enqueue(requests: ProviderActionRequest[]) {
        enqueued.push(requests)
        return { total: requests.length, inserted: 0, duplicates: requests.length }
      },
    }
  }

  it("enqueues exactly one action for a supported matched comment", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      { async findAccountAndAutomations() { return account() } },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord(), handlerContext())

    expect(result.outcome).toBe("succeeded")
    expect(sink.enqueued).toHaveLength(1)
    expect(sink.enqueued[0]).toHaveLength(1)
    expect(result.result).toMatchObject({
      sideEffectsExecuted: false,
      enqueuedActions: 1,
      duplicateActions: 0,
      candidateCount: 1,
    })
  })

  it("reports a replay as a duplicate instead of a newly enqueued action", async () => {
    const sink = duplicateOutbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      { async findAccountAndAutomations() { return account() } },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord(), handlerContext())

    expect(sink.enqueued).toHaveLength(1)
    expect(result.result).toMatchObject({
      enqueuedActions: 0,
      duplicateActions: 1,
      sideEffectsExecuted: false,
    })
  })

  it("enqueues nothing for a non-matching comment", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      { async findAccountAndAutomations() { return account() } },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord("comment-2", "unrelated chatter"), handlerContext())

    expect(sink.enqueued).toHaveLength(0)
    expect(result.result).toMatchObject({ enqueuedActions: 0, matchedAutomationIds: [] })
  })

  it("enqueues nothing for a self-authored comment", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      {
        async findAccountAndAutomations() {
          return { ...account(), accountId: "author-1" }
        },
      },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord(), handlerContext())

    expect(sink.enqueued).toHaveLength(0)
    expect(result.outcome).toBe("ignored")
    expect(result.result).toMatchObject({ reason: "self_authored_comment" })
  })

  it("enqueues nothing for an unsupported graph but still reports the match", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      {
        async findAccountAndAutomations() {
          return account({
            nodes: [TRIGGER, REPLY, { id: "cond", data: { type: "action_condition", config: {} } }],
            edges: [
              { source: "trigger", target: "cond" },
              { source: "cond", target: "reply" },
            ],
          })
        },
      },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord(), handlerContext())

    expect(sink.enqueued).toHaveLength(0)
    expect(result.result).toMatchObject({ enqueuedActions: 0 })
    expect((result.result as Record<string, unknown>).actionPlans)
      .toMatchObject([{ supported: false, reason: "unsupported_node_on_path" }])
  })

  it("enqueues nothing when more than one comment trigger matches", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      {
        async findAccountAndAutomations() {
          return account({
            nodes: [
              TRIGGER,
              {
                ...TRIGGER,
                id: "trigger-2",
              },
              REPLY,
            ],
            edges: [
              { source: "trigger", target: "reply" },
              { source: "trigger-2", target: "reply" },
            ],
          })
        },
      },
      { actionOutbox: sink },
    )

    const result = await handler(inboxRecord(), handlerContext())

    expect(sink.enqueued).toHaveLength(0)
    expect(result.result).toMatchObject({
      enqueuedActions: 0,
      duplicateActions: 0,
      comparisons: [{ matched: true, reason: "ambiguous_comment_triggers" }],
      actionPlans: [{ supported: false, reason: "no_matching_trigger" }],
    })
  })

  it("preserves existing comparison result fields and stays side-effect-free", async () => {
    const handler = createCommentPrivateReplyComparisonHandler(
      { async findAccountAndAutomations() { return account() } },
    )

    const result = await handler(inboxRecord(), handlerContext())

    // No outbox configured: behaviour is exactly as before Gate B.
    expect(result.result).toMatchObject({
      mode: "comparison",
      triggerType: "trigger_new_comment",
      intendedAction: "action_private_reply",
      commentId: "comment-1",
      postId: "post-1",
      candidateCount: 1,
      sideEffectsExecuted: false,
      enqueuedActions: 0,
      duplicateActions: 0,
    })
  })

  it("puts no credential into the enqueued payload", async () => {
    const sink = outbox()
    const handler = createCommentPrivateReplyComparisonHandler(
      { async findAccountAndAutomations() { return account() } },
      { actionOutbox: sink },
    )

    await handler(inboxRecord(), handlerContext())

    const serialized = JSON.stringify(sink.enqueued)
    expect(serialized).not.toMatch(/token|secret|authorization|bearer|password/i)
  })
})
