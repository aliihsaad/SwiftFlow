import { describe, expect, it } from "vitest"

import commentFixture from "@/tests/fixtures/webhooks/meta-instagram-comment.json"
import {
  compareCommentPrivateReplyAutomation,
  createCommentPrivateReplyComparisonHandler,
  parseCommentWebhookContext,
  type CommentComparisonAccount,
  type CommentComparisonLookup,
} from "@/lib/webhooks/comment-private-reply-comparison"
import { buildMetaWebhookInboxEvents } from "@/lib/webhooks/inbox-contract"
import type { WebhookInboxRecord } from "@/lib/webhooks/postgres-inbox-repository"

function inboxRecord(): WebhookInboxRecord {
  const event = buildMetaWebhookInboxEvents(commentFixture)[0]!
  return {
    id: "inbox-1",
    provider: event.provider,
    providerEventKey: event.providerEventKey,
    providerObject: event.providerObject,
    eventType: event.eventType,
    workspaceId: null,
    socialAccountId: null,
    accountExternalId: event.accountExternalId,
    deliveryHash: event.deliveryHash,
    payload: event.payload,
    status: "processing",
    attemptCount: 1,
    maxAttempts: 8,
    lockedBy: "worker-1",
    lockExpiresAt: "2026-07-26T13:01:00.000Z",
    receivedAt: "2026-07-26T13:00:00.000Z",
  }
}

function privateReplyGraph(connected = true) {
  return {
    nodes: [
      {
        id: "trigger",
        data: {
          type: "trigger_new_comment",
          config: {
            trigger_type: "keywords",
            keywords: ["price"],
            post_scope: "specific",
            post_id: "media-001",
            social_account_id: "social-1",
          },
        },
      },
      {
        id: "reply",
        data: {
          type: "action_private_reply",
          config: { message: "I sent the details privately." },
        },
      },
    ],
    edges: connected ? [{ source: "trigger", target: "reply" }] : [],
  }
}

function account(overrides: Partial<CommentComparisonAccount> = {}): CommentComparisonAccount {
  return {
    workspaceId: "workspace-1",
    socialAccountId: "social-1",
    accountId: "17890000000000000",
    connectedPageId: "page-1",
    automations: [{
      id: "automation-1",
      socialAccountId: "social-1",
      workflowGraph: privateReplyGraph(),
    }],
    ...overrides,
  }
}

describe("comment-to-private-reply comparison mode", () => {
  it("normalizes the signed inbox event into the existing comment context", () => {
    expect(parseCommentWebhookContext(inboxRecord())).toEqual({
      commentId: "comment-001",
      postId: "media-001",
      commenterId: "igsid-customer-001",
      // Added for self-loop protection; real Instagram Login payloads carry
      // from.self_ig_scoped_id, this fixture does not.
      commenterScopedId: null,
      commenterUsername: "customer",
      commentText: "PRICE please",
      mediaType: "FEED",
      timestamp: null,
    })
  })

  it("matches a reachable configured private reply using current keyword semantics", () => {
    const context = parseCommentWebhookContext(inboxRecord())!

    expect(compareCommentPrivateReplyAutomation(account().automations[0]!, context))
      .toEqual({
        automationId: "automation-1",
        matched: true,
        reason: "would_execute_private_reply",
        // Added so the action planner knows which trigger matched.
        triggerNodeId: "trigger",
      })
  })

  it("rejects disconnected private-reply nodes", () => {
    const context = parseCommentWebhookContext(inboxRecord())!
    const automation = {
      ...account().automations[0]!,
      workflowGraph: privateReplyGraph(false),
    }

    expect(compareCommentPrivateReplyAutomation(automation, context)).toMatchObject({
      matched: false,
      reason: "private_reply_not_reachable",
    })
  })

  it("records intended automation IDs without executing a Meta side effect", async () => {
    const lookup: CommentComparisonLookup = {
      async findAccountAndAutomations() {
        return account()
      },
    }
    const handler = createCommentPrivateReplyComparisonHandler(lookup)

    const result = await handler(inboxRecord(), { heartbeat: async () => true })

    expect(result).toMatchObject({
      outcome: "succeeded",
      workspaceId: "workspace-1",
      socialAccountId: "social-1",
      result: {
        mode: "comparison",
        intendedAction: "action_private_reply",
        matchedAutomationIds: ["automation-1"],
        sideEffectsExecuted: false,
      },
    })
  })

  it("ignores self-authored comments before comparison", async () => {
    const record = inboxRecord()
    const change = record.payload.change as Record<string, unknown>
    const value = change.value as Record<string, unknown>
    value.from = { id: "17890000000000000", username: "our-account" }
    const lookup: CommentComparisonLookup = {
      async findAccountAndAutomations() {
        return account()
      },
    }

    const result = await createCommentPrivateReplyComparisonHandler(lookup)(
      record,
      { heartbeat: async () => true },
    )

    expect(result).toMatchObject({
      outcome: "ignored",
      result: {
        reason: "self_authored_comment",
        sideEffectsExecuted: false,
      },
    })
  })
})
