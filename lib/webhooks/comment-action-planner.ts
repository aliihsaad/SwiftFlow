import {
  deriveWorkflowVersionId,
  type ProviderActionRequest,
} from "../automation/action-outbox-contract"

/**
 * Decides whether a matched comment automation may enqueue a provider action.
 *
 * Deliberately conservative: the only shape supported at this gate is a single
 * comment trigger wired by exactly one edge to a single private-reply action
 * carrying a static message. Anything else - a condition, a delay, a branch, an
 * AI-generated reply, or more than one reply action - returns an explicit
 * reason and enqueues nothing.
 *
 * `use_ai_response` is specifically refused rather than approximated: there is
 * no AI action-rendering path yet, so fabricating a message here would send
 * something no one authored.
 */

export const MAX_ACTION_MESSAGE_LENGTH = 900
const MAX_IDENTIFIER_LENGTH = 200

export type ActionPlanRefusal =
  | "no_matching_trigger"
  | "ambiguous_trigger"
  | "trigger_branches"
  | "trigger_has_no_action"
  | "unsupported_node_on_path"
  | "ambiguous_private_reply_actions"
  | "private_reply_not_configured"
  | "ai_response_not_supported"
  | "missing_target_comment"

export type ActionPlan =
  | { supported: true; request: ProviderActionRequest }
  | { supported: false; reason: ActionPlanRefusal }

export interface ActionPlanContext {
  providerEventKey: string
  automationId: string
  workflowGraph: Record<string, unknown>
  matchedTriggerNodeId: string
  workspaceId: string | null
  socialAccountId: string | null
  commentId: string
  authorExternalId: string | null
  authorScopedId: string | null
  postId: string | null
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter(Boolean) as Record<string, unknown>[]
    : []
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/**
 * Bounds a string and drops control characters before it reaches the database.
 * Uses code-point filtering rather than a regex so no escape sequence can be
 * mangled by tooling on the way into this file.
 */
function boundedIdentifier(value: string | null, maxLength = MAX_IDENTIFIER_LENGTH): string | null {
  if (!value) return null

  const cleaned = Array.from(value)
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0
      return code >= 0x20 && code !== 0x7f
    })
    .join("")
    .trim()

  return cleaned ? cleaned.slice(0, maxLength) : null
}

function nodeType(node: Record<string, unknown>): string {
  return text(asRecord(node.data)?.type)
}

function nodeConfig(node: Record<string, unknown>): Record<string, unknown> {
  return asRecord(asRecord(node.data)?.config) || {}
}

export function planCommentPrivateReplyAction(context: ActionPlanContext): ActionPlan {
  const nodes = asRecords(context.workflowGraph.nodes)
  const edges = asRecords(context.workflowGraph.edges)

  const triggerId = text(context.matchedTriggerNodeId)
  if (!triggerId) return { supported: false, reason: "no_matching_trigger" }

  const triggerNodes = nodes.filter((node) => text(node.id) === triggerId)
  if (triggerNodes.length !== 1) return { supported: false, reason: "ambiguous_trigger" }

  // Exactly one private-reply action may exist anywhere in the graph. More than
  // one makes the intended action ambiguous even if only one is reachable.
  const privateReplyNodes = nodes.filter((node) => nodeType(node) === "action_private_reply")
  if (privateReplyNodes.length > 1) {
    return { supported: false, reason: "ambiguous_private_reply_actions" }
  }
  if (privateReplyNodes.length === 0) {
    return { supported: false, reason: "trigger_has_no_action" }
  }

  // The trigger must fan out to exactly one node: no branching.
  const outgoing = edges.filter((edge) => text(edge.source) === triggerId)
  if (outgoing.length === 0) return { supported: false, reason: "trigger_has_no_action" }
  if (outgoing.length > 1) return { supported: false, reason: "trigger_branches" }

  const targetId = text(outgoing[0]!.target)
  const targetNode = nodes.find((node) => text(node.id) === targetId)
  if (!targetNode) return { supported: false, reason: "trigger_has_no_action" }

  // That single hop must land directly on the private reply. Any intermediate
  // node - condition, delay, AI step - is unsupported at this gate.
  if (nodeType(targetNode) !== "action_private_reply") {
    return { supported: false, reason: "unsupported_node_on_path" }
  }
  if (text(targetNode.id) !== text(privateReplyNodes[0]!.id)) {
    return { supported: false, reason: "ambiguous_private_reply_actions" }
  }

  // The reply must not itself branch onward into further unsupported work.
  if (edges.some((edge) => text(edge.source) === targetId)) {
    return { supported: false, reason: "unsupported_node_on_path" }
  }

  const config = nodeConfig(targetNode)
  if (config.use_ai_response === true) {
    return { supported: false, reason: "ai_response_not_supported" }
  }

  const message = text(config.message)
  if (!message) return { supported: false, reason: "private_reply_not_configured" }

  // A templated message would need rendering we do not perform here.
  if (message.includes("{{")) {
    return { supported: false, reason: "ai_response_not_supported" }
  }

  const commentId = boundedIdentifier(context.commentId)
  if (!commentId) return { supported: false, reason: "missing_target_comment" }

  return {
    supported: true,
    request: {
      identity: {
        provider: "meta",
        providerEventKey: context.providerEventKey,
        automationId: context.automationId,
        workflowVersionId: deriveWorkflowVersionId(context.workflowGraph),
        nodeId: text(targetNode.id),
        actionType: "action_private_reply",
        targetId: commentId,
      },
      workspaceId: context.workspaceId,
      socialAccountId: context.socialAccountId,
      // Routing and self-loop metadata only. No credential, no header, no
      // provider response - the executor resolves credentials itself.
      payload: {
        message: message.slice(0, MAX_ACTION_MESSAGE_LENGTH),
        authorExternalId: boundedIdentifier(context.authorExternalId),
        authorScopedId: boundedIdentifier(context.authorScopedId),
        commentId,
        postId: boundedIdentifier(context.postId),
        triggerNodeId: triggerId,
      },
    },
  }
}
