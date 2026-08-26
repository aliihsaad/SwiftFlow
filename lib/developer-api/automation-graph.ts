import type { WorkflowGraph } from "@/types/automation-graph"
import {
  isActionNode,
  isTriggerNode,
  SUPPORTED_CANVAS_TRIGGER_TYPES,
} from "@/types/automation-graph"
import { isMetaGraphNodeId } from "@/lib/security/phase1-validation"
import { isCommentPostScope } from "@/supabase/functions/_shared/comment-scope"
import {
  getAutomationConditionPolicyIssue,
  getAutomationConditionTriggerPolicyIssue,
} from "@/supabase/functions/_shared/automation-condition-policy"
import { validateTelegramNodeConfigs } from "@/lib/automation-telegram-validation"

export type DeveloperAutomationGraphError = {
  code: string
  message: string
  nodeId?: string
}

export type DeveloperAutomationGraphSummary = {
  triggerNode: {
    id: string
    type: string
    config: Record<string, unknown>
  } | null
  socialAccountId: string
  platformPostId: string
  postThumbnailUrl: string | null
  postCaption: string | null
  triggerConfig: {
    trigger_type: "any_comment" | "keywords"
    keywords: string[]
  }
}

const TEMP_DISABLED_NODE_TYPES = new Set([
  "trigger_story_mention",
  "action_http_request",
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : []
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true") return true
    if (value.trim().toLowerCase() === "false") return false
  }
  return null
}

function durationUnit(value: unknown): string {
  const unit = text(value).toLowerCase()
  if (unit === "second" || unit === "seconds") return "seconds"
  if (unit === "minute" || unit === "minutes") return "minutes"
  if (unit === "hour" || unit === "hours") return "hours"
  if (unit === "day" || unit === "days") return "days"
  return ""
}

function normalizeNodeConfig(nodeType: string, value: unknown,
): Record<string, unknown> {
  const config = { ...record(value) }

  if (nodeType === "trigger_new_comment" || nodeType === "trigger_new_message") {
    const triggerType = text(config.trigger_type)
    if (triggerType === "any_comment") config.trigger_type = "any"
  }

  if (nodeType === "trigger_new_comment") {
    // Drop invalid scopes so legacy resolution (post_id ? specific : any)
    // applies, and clear stale post selections on non-specific scopes.
    if (config.post_scope !== undefined && !isCommentPostScope(config.post_scope)) {
      delete config.post_scope
    }
    if (isCommentPostScope(config.post_scope) && config.post_scope !== "specific") {
      config.post_id = ""
      delete config.post_thumbnail_url
      delete config.post_caption
    }
  }

  if (nodeType === "action_delay") {
    const duration = numberValue(config.duration_value ?? config.duration ?? config.value,
    )
    if (duration !== null) config.duration_value = duration
    const unit = durationUnit(config.duration_unit ?? config.unit ?? config.durationUnit,
    )
    if (unit) config.duration_unit = unit
  }

  if (nodeType === "action_ai_response") {
    const maxTokens = numberValue(config.max_tokens)
    if (maxTokens !== null) config.max_tokens = maxTokens
  }

  if (nodeType === "action_send_dm" || nodeType === "action_private_reply" || nodeType === "action_reply_comment") {
    const useAiResponse = booleanValue(config.use_ai_response)
    if (useAiResponse !== null) config.use_ai_response = useAiResponse
  }

  if (nodeType === "action_send_email" || nodeType === "action_telegram") {
    const includeContext = booleanValue(config.include_context)
    if (includeContext !== null) config.include_context = includeContext
    const includeTechnicalDetails = booleanValue(config.include_technical_details,
    )
    if (includeTechnicalDetails !== null) config.include_technical_details = includeTechnicalDetails
  }

  if (nodeType === "action_telegram") {
    const includeAiResponse = booleanValue(config.include_ai_response)
    if (includeAiResponse !== null)
      config.include_ai_response = includeAiResponse
    const approvalTimeout = numberValue(config.approval_timeout_value)
    if (approvalTimeout !== null)
      config.approval_timeout_value = approvalTimeout
  }

  return config
}

function normalizeDeveloperAutomationGraph(graph: WorkflowGraph,
): WorkflowGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const nodeType = String(node.data?.type || "")
      return {
        ...node,
        data: {
          ...node.data,
          config: normalizeNodeConfig(nodeType, node.data?.config),
        } as unknown as typeof node.data,
      }
    }),
  }
}

function hasMeaningfulMessage(value: unknown): boolean {
  const message = text(value)
  if (!message) return false
  return !/^reply\s*\d+$/i.test(message)
}

function graphShape(value: unknown): WorkflowGraph | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const maybeGraph = value as Partial<WorkflowGraph>
  if (!Array.isArray(maybeGraph.nodes) || !Array.isArray(maybeGraph.edges)) return null
  return maybeGraph as WorkflowGraph
}

export function summarizeDeveloperAutomationGraph(graph: unknown,
): DeveloperAutomationGraphSummary | null {
  const rawGraph = graphShape(graph)
  if (!rawGraph) return null
  const workflowGraph = normalizeDeveloperAutomationGraph(rawGraph)
  const triggerNode = workflowGraph.nodes.find((node) => isTriggerNode(String(node.data?.type || "")),
  )
  if (!triggerNode) return null
  const config = record(triggerNode.data?.config)
  const triggerType = String(triggerNode.data?.type || "")
  const triggerConfigType = text(config.trigger_type) === "keywords" ? "keywords" : "any_comment"

  return {
    triggerNode: {
      id: triggerNode.id,
      type: triggerType,
      config,
    },
    socialAccountId: text(config.social_account_id),
    // Broad-scope comment triggers have no post selection; use the same
    // '__canvas__' sentinel the app's automations route stores.
    platformPostId: triggerType === "trigger_new_comment" ? text(config.post_id) || "__canvas__"
        : "__canvas__",
    postThumbnailUrl: text(config.post_thumbnail_url) || null,
    postCaption: text(config.post_caption) || null,
    triggerConfig: {
      trigger_type: triggerConfigType,
      keywords: stringList(config.keywords),
    },
  }
}

export function validateDeveloperAutomationGraph(
  graph: unknown,
  options: {
    expectedSocialAccountId?: string
    requirePostId?: boolean
  } = {},
): { graph: WorkflowGraph | null; errors: DeveloperAutomationGraphError[]; summary: DeveloperAutomationGraphSummary | null } {
  const rawGraph = graphShape(graph)
  const errors: DeveloperAutomationGraphError[] = []
  if (!rawGraph) {
    return {
      graph: null,
      summary: null,
      errors: [{ code: "INVALID_GRAPH", message: "workflow_graph must include nodes and edges arrays.",
        },
      ],
    }
  }
  const workflowGraph = normalizeDeveloperAutomationGraph(rawGraph)

  const triggerNodes = workflowGraph.nodes.filter((node) => isTriggerNode(String(node.data?.type || "")),
  )
  if (triggerNodes.length !== 1) {
    errors.push({
      code: triggerNodes.length === 0 ? "NO_TRIGGER" : "MULTIPLE_TRIGGERS",
      message: "workflow_graph must include exactly one trigger node.",
      nodeId: triggerNodes[1]?.id,
    })
  }

  const summary = summarizeDeveloperAutomationGraph(workflowGraph)
  const supportedTriggers = new Set(SUPPORTED_CANVAS_TRIGGER_TYPES)

  for (const node of workflowGraph.nodes) {
    const nodeType = String(node.data?.type || "")
    const config = record(node.data?.config)
    if (!nodeType || (!isTriggerNode(nodeType) && !isActionNode(nodeType))) {
      errors.push({ code: "INVALID_NODE_TYPE", message: "Each node must include a supported data.type.", nodeId: node.id,
      })
      continue
    }
    if (TEMP_DISABLED_NODE_TYPES.has(nodeType)) {
      errors.push({ code: "NODE_TEMPORARILY_DISABLED", message: `${node.data?.label || nodeType} is temporarily disabled.`, nodeId: node.id,
      })
      continue
    }
    if (isTriggerNode(nodeType) && !supportedTriggers.has(nodeType as (typeof SUPPORTED_CANVAS_TRIGGER_TYPES)[number],
      )) {
      errors.push({ code: "UNSUPPORTED_TRIGGER", message: `${node.data?.label || nodeType} is not enabled for live automations yet.`, nodeId: node.id,
      })
    }

    switch (nodeType) {
      case "trigger_new_comment":
        if (!text(config.social_account_id)) {
          errors.push({ code: "MISSING_FIELD", message: "Comment trigger requires social_account_id.", nodeId: node.id,
          })
        }
        if (options.expectedSocialAccountId && text(config.social_account_id) !== options.expectedSocialAccountId) {
          errors.push({ code: "ACCOUNT_MISMATCH", message: "Trigger social_account_id must match the automation social_account_id.", nodeId: node.id,
          })
        }
        // Broad scopes must be opted into explicitly via post_scope; without
        // one, the Developer API keeps its original contract of requiring a
        // specific post so clients cannot create any-comment automations by
        // accidentally omitting post_id.
        {
          const explicitBroadScope = isCommentPostScope(config.post_scope) && config.post_scope !== "specific"
          if (options.requirePostId && !explicitBroadScope && !text(config.post_id)) {
            errors.push({ code: "MISSING_FIELD", message: "Comment trigger requires post_id (or an explicit post_scope of any/any_post/any_reel).", nodeId: node.id,
            })
          }
        }
        if (text(config.post_id) && !isMetaGraphNodeId(text(config.post_id))) {
          errors.push({ code: "INVALID_POST_ID", message: "Comment trigger post_id must be a valid Meta object ID.", nodeId: node.id,
          })
        }
        break
      case "trigger_new_message":
      case "trigger_story_reply":
        if (!text(config.social_account_id)) {
          errors.push({ code: "MISSING_FIELD", message: "Trigger requires social_account_id.", nodeId: node.id,
          })
        }
        if (options.expectedSocialAccountId && text(config.social_account_id) !== options.expectedSocialAccountId) {
          errors.push({ code: "ACCOUNT_MISMATCH", message: "Trigger social_account_id must match the automation social_account_id.", nodeId: node.id,
          })
        }
        break
      case "action_send_dm":
        if (config.use_ai_response !== true && !hasMeaningfulMessage(config.opening_message)) {
          errors.push({ code: "MISSING_FIELD", message: "Send DM requires opening_message or use_ai_response: true.", nodeId: node.id,
          })
        }
        break
      case "action_private_reply":
        if (config.use_ai_response !== true && !hasMeaningfulMessage(config.message)) {
          errors.push({ code: "MISSING_FIELD", message: "Private Reply requires message or use_ai_response: true.", nodeId: node.id,
          })
        }
        break
      case "action_reply_comment": {
        const messages = Array.isArray(config.messages) ? config.messages : []
        if (config.use_ai_response !== true && !messages.some(hasMeaningfulMessage)) {
          errors.push({ code: "MISSING_FIELD", message: "Reply to Comment requires at least one real reply message or use_ai_response: true.", nodeId: node.id,
          })
        }
        break
      }
      case "action_condition": {
        const conditionIssue = getAutomationConditionPolicyIssue(config.condition_type,
        )
        if (conditionIssue) errors.push({ ...conditionIssue, nodeId: node.id })
        const triggerIssue = getAutomationConditionTriggerPolicyIssue(
          config.condition_type,
          triggerNodes[0]?.data?.type,
        )
        if (triggerIssue) errors.push({ ...triggerIssue, nodeId: node.id })
        break
      }
      case "action_delay":
        if (typeof config.duration_value !== "number" || config.duration_value <= 0) {
          errors.push({ code: "MISSING_FIELD", message: "Delay requires a positive duration_value.", nodeId: node.id,
          })
        }
        break
      case "action_send_email":
        if (!text(config.subject)) {
          errors.push({ code: "MISSING_FIELD", message: "Send Email requires subject.", nodeId: node.id,
          })
        }
        if (config.include_context === false && !text(config.body)) {
          errors.push({ code: "MISSING_FIELD", message: "Send Email requires body when include_context is false.", nodeId: node.id,
          })
        }
        break
      case "action_ai_response":
        if (config.max_tokens !== undefined && (typeof config.max_tokens !== "number" || config.max_tokens <= 0)) {
          errors.push({ code: "INVALID_FIELD", message: "AI Response max_tokens must be a positive number.", nodeId: node.id,
          })
        }
        break
    }
  }

  for (const issue of validateTelegramNodeConfigs(workflowGraph)) {
    errors.push(issue)
  }

  return { graph: workflowGraph, errors, summary }
}
