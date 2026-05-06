import {
  getDefaultConfig,
  type ActionAiResponseConfig,
  type ActionConditionConfig,
  type ActionDelayConfig,
  type ActionHttpRequestConfig,
  type ActionPrivateReplyConfig,
  type ActionReplyCommentConfig,
  type ActionSendDMConfig,
  type ActionSendEmailConfig,
  type TriggerCronConfig,
  type TriggerNewCommentConfig,
  type TriggerNewFollowerConfig,
  type TriggerNewMessageConfig,
  type TriggerStoryMentionConfig,
  type TriggerStoryReplyConfig,
  type WorkflowEdge,
  type WorkflowGraph,
  type WorkflowNode,
} from "@/types/automation-graph"
import type { AutomationWizardState, WizardActionConfig } from "./types"

function nodeId(index: number, type: string): string {
  return `wizard-${String(index).padStart(2, "0")}-${type}`
}

function edgeId(source: string, target: string, label?: string): string {
  return label
    ? `wizard-edge-${source}-${label}-${target}`
    : `wizard-edge-${source}-${target}`
}

function mergeConfig(
  type: WorkflowNode["data"]["type"],
  config: Record<string, unknown>,
): WorkflowNode["data"]["config"] {
  switch (type) {
    case "trigger_new_comment":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerNewCommentConfig>) }
    case "trigger_new_message":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerNewMessageConfig>) }
    case "trigger_new_follower":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerNewFollowerConfig>) }
    case "trigger_cron":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerCronConfig>) }
    case "trigger_story_mention":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerStoryMentionConfig>) }
    case "trigger_story_reply":
      return { ...getDefaultConfig(type), ...(config as Partial<TriggerStoryReplyConfig>) }
    case "action_send_dm":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionSendDMConfig>) }
    case "action_private_reply":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionPrivateReplyConfig>) }
    case "action_reply_comment":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionReplyCommentConfig>) }
    case "action_delay":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionDelayConfig>) }
    case "action_condition":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionConditionConfig>) }
    case "action_send_email":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionSendEmailConfig>) }
    case "action_http_request":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionHttpRequestConfig>) }
    case "action_ai_response":
      return { ...getDefaultConfig(type), ...(config as Partial<ActionAiResponseConfig>) }
  }
}

function makeNode(
  index: number,
  type: WorkflowNode["data"]["type"],
  label: string,
  config: Record<string, unknown>,
): WorkflowNode {
  return {
    id: nodeId(index, type),
    type: type.startsWith("trigger_") ? "trigger" : "action",
    position: { x: index * 280, y: 120 },
    data: {
      type,
      label,
      config: mergeConfig(type, config),
    },
  }
}

function enabledActions(state: AutomationWizardState): WizardActionConfig[] {
  return state.actions.filter((action) => action.enabled)
}

function actionLabel(type: WizardActionConfig["type"]): string {
  const labels: Record<WizardActionConfig["type"], string> = {
    action_send_dm: "Send DM",
    action_private_reply: "Private Reply",
    action_reply_comment: "Reply to Comment",
    action_delay: "Delay",
    action_condition: "Condition",
    action_send_email: "Send Email",
    action_http_request: "HTTP Request",
    action_ai_response: "AI Response",
  }
  return labels[type]
}

function actionConfig(action: WizardActionConfig, useAiResponse: boolean): Record<string, unknown> {
  switch (action.type) {
    case "action_reply_comment":
      return {
        use_ai_response: useAiResponse,
        messages: useAiResponse
          ? ["{{ai_response}}"]
          : action.messages?.length
            ? action.messages
            : [action.message || "Thanks for your comment."],
      }
    case "action_send_dm":
      return {
        use_ai_response: useAiResponse,
        opening_message: useAiResponse
          ? "{{ai_response}}"
          : action.openingMessage || action.message || "",
        button_text: action.buttonText || "",
        link_url: action.linkUrl || "",
        link_message: action.linkMessage || "",
        fallback_to_private_reply_on_failure: !!action.fallbackToPrivateReplyOnFailure,
        fallback_message: action.fallbackMessage || "",
      }
    case "action_private_reply":
      return {
        use_ai_response: useAiResponse,
        message: useAiResponse ? "{{ai_response}}" : action.message || "",
      }
    case "action_send_email":
      return {
        recipient_type: "custom",
        recipient_email: action.recipientEmail || "",
        subject: action.emailSubject || "",
        body: action.emailBody || "",
      }
    case "action_http_request":
      return {
        method: action.httpMethod || "POST",
        url: action.httpUrl || "",
        headers: action.httpHeaders || {},
        body: action.httpBody || "",
      }
    case "action_condition":
      return {
        condition_type: action.conditionType || "keyword_match",
        operator: action.conditionOperator || "contains",
        keywords: action.conditionKeywords || [],
        threshold: action.conditionThreshold,
      }
    case "action_delay":
      return { duration_value: 5, duration_unit: "minutes" }
    case "action_ai_response":
      return {
        use_global_settings: true,
        max_tokens: 500,
        preset_goal: "auto",
        tone: "friendly",
        length: "short",
        emoji_level: "light",
      }
  }
}

export function compileAutomationWizardGraph(state: AutomationWizardState): WorkflowGraph {
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []

  nodes.push(makeNode(0, state.triggerType, "Trigger", {
    platform: state.account.platform,
    social_account_id: state.account.socialAccountId,
    trigger_type: state.filters.triggerType,
    keywords: state.filters.keywords,
    post_id: state.target.postId || "",
    post_thumbnail_url: state.target.postThumbnailUrl || "",
    post_caption: state.target.postCaption || "",
  }))

  let index = 1
  if (state.delay.enabled) {
    nodes.push(makeNode(index, "action_delay", "Delay", {
      duration_value: state.delay.durationValue,
      duration_unit: state.delay.durationUnit,
    }))
    index += 1
  }

  if (state.ai.enabled) {
    nodes.push(makeNode(index, "action_ai_response", "AI Response", {
      use_global_settings: state.ai.useGlobalSettings,
      max_tokens: 500,
      preset_goal: state.ai.presetGoal,
      tone: state.ai.tone,
      length: state.ai.length,
      emoji_level: state.ai.emojiLevel,
      custom_instructions: state.ai.customInstructions,
    }))
    index += 1
  }

  for (const action of enabledActions(state)) {
    if (action.type === "action_delay" || action.type === "action_ai_response") {
      continue
    }
    nodes.push(makeNode(index, action.type, actionLabel(action.type), actionConfig(action, state.ai.enabled)))
    index += 1
  }

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const sourceNode = nodes[i]
    const source = sourceNode.id
    const target = nodes[i + 1].id
    if (sourceNode.data.type === "action_condition") {
      edges.push({
        id: edgeId(source, target, "true"),
        source,
        target,
        sourceHandle: "true",
        type: "custom",
        animated: true,
        data: { label: "true" },
      })
      continue
    }
    edges.push({ id: edgeId(source, target), source, target, type: "custom", animated: true })
  }

  return { nodes, edges }
}
