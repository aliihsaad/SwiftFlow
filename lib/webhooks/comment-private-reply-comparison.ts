import type {
  ActionOutboxEnqueueResult,
  ProviderActionRequest,
} from "../automation/action-outbox-contract"
import { planCommentPrivateReplyAction, type ActionPlan } from "./comment-action-planner"
import type {
  WebhookInboxHandler,
  WebhookInboxHandlerResult,
} from "./inbox-worker"
import type {
  PostgresQueryClient,
  WebhookInboxRecord,
} from "./postgres-inbox-repository"

export interface CommentWebhookContext {
  commentId: string
  postId: string
  commenterId: string
  /** Instagram's scoped author id, present on real Instagram Login payloads. */
  commenterScopedId: string | null
  commenterUsername: string | null
  commentText: string
  mediaType: string | null
  timestamp: string | null
}

interface StoredAutomation {
  id: string
  socialAccountId: string
  workflowVersionId: string
  workflowGraph: Record<string, unknown>
}

export interface CommentComparisonAccount {
  workspaceId: string
  socialAccountId: string
  accountId: string
  connectedPageId: string | null
  automations: StoredAutomation[]
}

export interface CommentComparisonLookup {
  findAccountAndAutomations(
    accountExternalId: string,
  ): Promise<CommentComparisonAccount | null>
}

export const FIND_COMMENT_COMPARISON_AUTOMATIONS_SQL = `
  with resolved_account as (
    select
      account.id,
      account.workspace_id,
      account.account_id,
      account.metadata
    from public.social_accounts as account
    where account.account_id = $1
      or account.metadata ->> 'connected_page_id' = $1
      or account.metadata ->> 'page_id' = $1
      or account.metadata ->> 'instagram_business_account_id' = $1
      or account.metadata ->> 'ig_user_id' = $1
    order by case when account.account_id = $1 then 0 else 1 end
    limit 1
  )
  select
    account.workspace_id,
    account.id as social_account_id,
    account.account_id,
    account.metadata ->> 'connected_page_id' as connected_page_id,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', automation.id,
          'social_account_id', automation.social_account_id,
          'workflow_version_id', automation.current_workflow_version_id,
          'workflow_graph', automation.workflow_graph
        )
        order by automation.created_at asc
      ) filter (where automation.id is not null),
      '[]'::jsonb
    ) as automations
  from resolved_account as account
  left join public.automations as automation
    on automation.workspace_id = account.workspace_id
    and automation.social_account_id = account.id
    and automation.is_active = true
    and automation.editor_version = 'canvas'
    and automation.current_workflow_version_id is not null
    and automation.workflow_graph is not null
  group by
    account.workspace_id,
    account.id,
    account.account_id,
    account.metadata
`

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

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

function workflowNodeType(node: Record<string, unknown>): string {
  return stringValue(asRecord(node.data)?.type) || ""
}

function workflowNodeConfig(node: Record<string, unknown>): Record<string, unknown> {
  return asRecord(asRecord(node.data)?.config) || {}
}

function commentScopeMatches(
  config: Record<string, unknown>,
  context: CommentWebhookContext,
): boolean {
  const configuredScope = stringValue(config.post_scope)
  const scope = configuredScope || (stringValue(config.post_id) ? "specific" : "any")
  const mediaType = (context.mediaType || "").toUpperCase()
  const isReel = mediaType === "REELS" || mediaType === "REEL"

  if (scope === "specific") {
    const configuredPostId = stringValue(config.post_id)
    return !configuredPostId || configuredPostId === context.postId
  }
  if (scope === "any_reel") return isReel
  if (scope === "any_post") return !isReel
  return true
}

function keywordMatches(config: Record<string, unknown>, text: string): boolean {
  if (config.trigger_type !== "keywords") return true
  const keywords = Array.isArray(config.keywords)
    ? config.keywords.map(stringValue).filter(Boolean) as string[]
    : []
  if (keywords.length === 0) return false
  const lowerText = text.toLowerCase()
  return keywords.some((keyword) => lowerText.includes(keyword.toLowerCase()))
}

function hasPath(
  sourceIds: string[],
  targetIds: Set<string>,
  edges: Record<string, unknown>[],
): boolean {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    const source = stringValue(edge.source)
    const target = stringValue(edge.target)
    if (!source || !target) continue
    adjacency.set(source, [...(adjacency.get(source) || []), target])
  }

  const queue = [...sourceIds]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (!nodeId || visited.has(nodeId)) continue
    if (targetIds.has(nodeId)) return true
    visited.add(nodeId)
    queue.push(...(adjacency.get(nodeId) || []))
  }
  return false
}

export function parseCommentWebhookContext(
  event: WebhookInboxRecord,
): CommentWebhookContext | null {
  if (event.provider !== "meta" || event.eventType !== "comments") return null

  const change = asRecord(event.payload.change)
  const value = asRecord(change?.value)
  const media = asRecord(value?.media)
  const from = asRecord(value?.from)
  const commentId = stringValue(value?.id) || stringValue(value?.comment_id)
  const postId = stringValue(media?.id) || stringValue(value?.post_id)
  const commenterId = stringValue(from?.id) || stringValue(value?.from_id)
  if (!commentId || !postId || !commenterId) return null

  return {
    commentId,
    postId,
    commenterId,
    commenterScopedId: stringValue(from?.self_ig_scoped_id) || null,
    commenterUsername: stringValue(from?.username) || stringValue(from?.name) || null,
    commentText: stringValue(value?.text) || stringValue(value?.message) || "",
    mediaType: stringValue(media?.media_product_type) || null,
    timestamp: stringValue(value?.created_time) || null,
  }
}

export function compareCommentPrivateReplyAutomation(
  automation: StoredAutomation,
  context: CommentWebhookContext,
): { automationId: string; matched: boolean; reason: string; triggerNodeId?: string } {
  const nodes = asRecords(automation.workflowGraph.nodes)
  const edges = asRecords(automation.workflowGraph.edges)
  const triggerNodes = nodes.filter((node) => workflowNodeType(node) === "trigger_new_comment")
  const privateReplyNodes = nodes.filter((node) => workflowNodeType(node) === "action_private_reply")

  if (triggerNodes.length === 0) {
    return { automationId: automation.id, matched: false, reason: "missing_comment_trigger" }
  }
  if (privateReplyNodes.length === 0) {
    return { automationId: automation.id, matched: false, reason: "missing_private_reply_action" }
  }

  const matchingTriggerIds = triggerNodes
    .filter((node) => {
      const config = workflowNodeConfig(node)
      const configuredAccountId = stringValue(config.social_account_id)
      return (
        (!configuredAccountId || configuredAccountId === automation.socialAccountId)
        && commentScopeMatches(config, context)
        && keywordMatches(config, context.commentText)
      )
    })
    .map((node) => stringValue(node.id))
    .filter(Boolean) as string[]

  if (matchingTriggerIds.length === 0) {
    return { automationId: automation.id, matched: false, reason: "trigger_did_not_match" }
  }
  if (matchingTriggerIds.length > 1) {
    return {
      automationId: automation.id,
      matched: true,
      reason: "ambiguous_comment_triggers",
    }
  }
  const triggerNodeId = matchingTriggerIds[0]

  const configuredPrivateReplyIds = new Set(
    privateReplyNodes
      .filter((node) => {
        const config = workflowNodeConfig(node)
        return stringValue(config.message) || config.use_ai_response === true
      })
      .map((node) => stringValue(node.id))
      .filter(Boolean) as string[],
  )

  if (configuredPrivateReplyIds.size === 0) {
    return { automationId: automation.id, matched: false, reason: "private_reply_not_configured" }
  }

  if (!hasPath(matchingTriggerIds, configuredPrivateReplyIds, edges)) {
    return { automationId: automation.id, matched: false, reason: "private_reply_not_reachable" }
  }

  return {
    automationId: automation.id,
    matched: true,
    reason: "would_execute_private_reply",
    triggerNodeId,
  }
}

export class PostgresCommentComparisonLookup implements CommentComparisonLookup {
  constructor(private readonly database: PostgresQueryClient) {}

  async findAccountAndAutomations(
    accountExternalId: string,
  ): Promise<CommentComparisonAccount | null> {
    const result = await this.database.query(FIND_COMMENT_COMPARISON_AUTOMATIONS_SQL, [
      accountExternalId,
    ])
    const row = result.rows[0]
    if (!row) return null

    const automations = asRecords(row.automations).map((automation) => ({
      id: stringValue(automation.id) || "",
      socialAccountId: stringValue(automation.social_account_id) || "",
      workflowVersionId: stringValue(automation.workflow_version_id) || "",
      workflowGraph: asRecord(automation.workflow_graph) || {},
    })).filter((automation) =>
      automation.id
      && automation.socialAccountId
      && automation.workflowVersionId
    )

    return {
      workspaceId: stringValue(row.workspace_id) || "",
      socialAccountId: stringValue(row.social_account_id) || "",
      accountId: stringValue(row.account_id) || "",
      connectedPageId: stringValue(row.connected_page_id) || null,
      automations,
    }
  }
}

export interface CommentComparisonEnqueueOptions {
  /**
   * Optional append-only outbox. When provided, a supported matched automation
   * has its intended action enqueued BEFORE the inbox event is finalised, so a
   * crash between the two is recovered by lease expiry and the unique action
   * identity makes the second insert a no-op.
   *
   * Enqueueing is not execution: the comparison worker still makes no provider
   * call and still reports sideEffectsExecuted false.
   */
  actionOutbox?: {
    enqueue(requests: ProviderActionRequest[]): Promise<ActionOutboxEnqueueResult>
  }
}

export function createCommentPrivateReplyComparisonHandler(
  lookup: CommentComparisonLookup,
  options: CommentComparisonEnqueueOptions = {},
): WebhookInboxHandler {
  return async (event): Promise<WebhookInboxHandlerResult> => {
    if (event.provider !== "meta" || event.eventType !== "comments") {
      return {
        outcome: "ignored",
        result: {
          mode: "comparison",
          reason: "unsupported_event_type",
          sideEffectsExecuted: false,
        },
      }
    }

    const context = parseCommentWebhookContext(event)
    if (!context || !event.accountExternalId) {
      return {
        outcome: "ignored",
        result: {
          mode: "comparison",
          reason: "invalid_comment_payload",
          sideEffectsExecuted: false,
        },
      }
    }

    const account = await lookup.findAccountAndAutomations(event.accountExternalId)
    if (!account) {
      return {
        outcome: "ignored",
        result: {
          mode: "comparison",
          reason: "account_not_resolved",
          sideEffectsExecuted: false,
        },
      }
    }

    if (
      context.commenterId === account.accountId
      || context.commenterId === account.connectedPageId
    ) {
      return {
        outcome: "ignored",
        workspaceId: account.workspaceId,
        socialAccountId: account.socialAccountId,
        result: {
          mode: "comparison",
          reason: "self_authored_comment",
          sideEffectsExecuted: false,
        },
      }
    }

    const comparisons = account.automations.map((automation) =>
      compareCommentPrivateReplyAutomation(automation, context)
    )
    const matchedAutomationIds = comparisons
      .filter((comparison) => comparison.matched)
      .map((comparison) => comparison.automationId)

    // Plan an intended action for every matched automation. Planning is pure;
    // nothing external happens here.
    const plans = comparisons
      .filter((comparison) => comparison.matched)
      .map((comparison) => {
        const automation = account.automations.find((item) => item.id === comparison.automationId)
        if (!automation || !comparison.triggerNodeId) {
          return { automationId: comparison.automationId, plan: { supported: false, reason: "no_matching_trigger" } as ActionPlan }
        }
        return {
          automationId: comparison.automationId,
          plan: planCommentPrivateReplyAction({
            providerEventKey: event.providerEventKey,
            automationId: comparison.automationId,
            workflowVersionId: automation.workflowVersionId,
            workflowGraph: automation.workflowGraph,
            matchedTriggerNodeId: comparison.triggerNodeId as string,
            workspaceId: account.workspaceId,
            socialAccountId: account.socialAccountId,
            commentId: context.commentId,
            authorExternalId: context.commenterId,
            authorScopedId: context.commenterScopedId,
            postId: context.postId,
          }),
        }
      })

    const supported = plans.filter((entry) => entry.plan.supported)
    let enqueuedActions = 0
    let duplicateActions = 0

    // Enqueue BEFORE the caller finalises the inbox event. A crash in between
    // is recovered by lease expiry, and the unique action identity makes the
    // repeated insert a no-op rather than a second action.
    if (options.actionOutbox && supported.length > 0) {
      const enqueueResult = await options.actionOutbox.enqueue(
        supported.map((entry) => (entry.plan as { supported: true; request: ProviderActionRequest }).request),
      )
      enqueuedActions = enqueueResult.inserted
      duplicateActions = enqueueResult.duplicates
    }

    return {
      outcome: "succeeded",
      workspaceId: account.workspaceId,
      socialAccountId: account.socialAccountId,
      result: {
        mode: "comparison",
        triggerType: "trigger_new_comment",
        intendedAction: "action_private_reply",
        commentId: context.commentId,
        postId: context.postId,
        candidateCount: comparisons.length,
        matchedAutomationIds,
        comparisons,
        // Enqueueing an intended action is not a provider side effect. The
        // comparison worker still performs no external call.
        sideEffectsExecuted: false,
        enqueuedActions,
        duplicateActions,
        actionPlans: plans.map((entry) => ({
          automationId: entry.automationId,
          supported: entry.plan.supported,
          reason: entry.plan.supported ? "enqueued" : entry.plan.reason,
        })),
      },
    }
  }
}
