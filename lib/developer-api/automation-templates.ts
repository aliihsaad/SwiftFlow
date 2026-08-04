import { AUTOMATION_TEMPLATES, getAutomationTemplateById } from "@/lib/automation-templates"
import type { WorkflowGraph, WorkflowNode } from "@/types/automation-graph"
import { isActionNode, isTriggerNode } from "@/types/automation-graph"

type TemplateBuildContext = {
  socialAccountId: string
  platform: "instagram"
}

type TemplateBuildResult =
  | { graph: WorkflowGraph; error?: never }
  | { graph?: never; error: string }

function text(value: unknown, max = 500): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => text(item, 500)).filter(Boolean) : []
}

function cloneGraph(graph: WorkflowGraph): WorkflowGraph {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: {
        ...node.data,
        config: { ...(node.data?.config as unknown as Record<string, unknown> | undefined) },
      } as unknown as typeof node.data,
    })),
    edges: graph.edges.map((edge) => ({ ...edge, data: edge.data ? { ...edge.data } : undefined })),
  }
}

function nodeConfig(node: WorkflowNode): Record<string, unknown> {
  return node.data.config as unknown as Record<string, unknown>
}

function applyDelay(graph: WorkflowGraph, durationSeconds: number): WorkflowGraph {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return graph

  const trigger = graph.nodes.find((node) => isTriggerNode(String(node.data?.type || "")))
  if (!trigger) return graph

  const existingDelay = graph.nodes.find((node) => String(node.data?.type || "") === "action_delay")
  if (existingDelay) {
    nodeConfig(existingDelay).duration_value = durationSeconds
    nodeConfig(existingDelay).duration_unit = "seconds"
    return graph
  }

  const firstOutgoing = graph.edges.find((edge) => edge.source === trigger.id)
  if (!firstOutgoing) return graph

  const delayId = `${trigger.id}-delay`
  graph.nodes.push({
    id: delayId,
    type: "action",
    position: { x: trigger.position.x + 220, y: trigger.position.y },
    data: {
      type: "action_delay",
      label: "Delay",
      config: {
        duration_value: durationSeconds,
        duration_unit: "seconds",
      },
    },
  } as WorkflowNode)

  const originalTarget = firstOutgoing.target
  firstOutgoing.target = delayId
  graph.edges.push({
    id: `${delayId}-edge`,
    source: delayId,
    target: originalTarget,
    type: firstOutgoing.type,
    animated: firstOutgoing.animated,
  })
  return graph
}

export function listDeveloperAutomationTemplates() {
  return AUTOMATION_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    supportedPlatforms: template.supportedPlatforms,
    tags: template.tags || [],
    graphSummary: summarizeTemplateGraph(template.buildGraph()),
    requiredInputs: requiredInputsForTemplate(template.id),
    optionalInputs: [
      {
        name: "delay_seconds",
        type: "number",
        description: "Insert a delay after the trigger before the template actions run.",
      },
      {
        name: "is_active",
        type: "boolean",
        description: "Create the automation active or paused.",
      },
      {
        name: "ai_tone",
        type: "enum",
        description: "Adjust AI response tone for templates with an AI Response node.",
      },
      {
        name: "ai_length",
        type: "enum",
        description: "Adjust AI response length for templates with an AI Response node.",
      },
      {
        name: "ai_custom_instructions",
        type: "string",
        description: "Add extra instructions for templates with an AI Response node.",
      },
      {
        name: "reply_messages",
        type: "string[]",
        description: "Override reply messages for templates with a Reply to Comment node.",
      },
      {
        name: "dm_opening_message",
        type: "string",
        description: "Override DM opening text for templates with a Send DM node.",
      },
      {
        name: "dm_button_text",
        type: "string",
        description: "Override DM button text for templates with a Send DM node.",
      },
      {
        name: "dm_link_url",
        type: "string",
        description: "Set the destination URL for templates with a Send DM node.",
      },
    ],
  }))
}

function summarizeTemplateGraph(graph: WorkflowGraph) {
  const nodes = graph.nodes.map((node) => ({
    type: String(node.data?.type || ""),
    label: String(node.data?.label || ""),
    category: isTriggerNode(String(node.data?.type || "")) ? "trigger" : isActionNode(String(node.data?.type || "")) ? "action" : "unknown",
  }))
  return {
    trigger: nodes.find((node) => node.category === "trigger") || null,
    actions: nodes.filter((node) => node.category === "action"),
    supportsDelay: true,
  }
}

function requiredInputsForTemplate(templateId: string) {
  const common = [
    { name: "template_id", type: "string", description: "Template id." },
    { name: "social_account_id", type: "uuid", description: "Connected social account UUID." },
    { name: "name", type: "string", description: "Automation name." },
  ]
  if (templateId === "tpl-reply-comments-ai" || templateId === "tpl-dm-commenters-link" || templateId === "tpl-private-reply-commenters") {
    return [
      ...common,
      { name: "post_id", type: "string", description: "Instagram media id from swiftflow_list_automation_media." },
    ]
  }
  return common
}

export function buildDeveloperAutomationGraphFromTemplate(
  body: Record<string, unknown>,
  context: TemplateBuildContext,
): TemplateBuildResult {
  const templateId = text(body.template_id, 120)
  const template = getAutomationTemplateById(templateId)
  if (!template) return { error: "Unknown automation template_id." }
  if (!template.supportedPlatforms.includes(context.platform)) {
    return { error: `Template ${template.id} does not support ${context.platform}.` }
  }

  const graph = cloneGraph(template.buildGraph())
  const postId = text(body.post_id ?? body.platform_post_id, 120)
  const postThumbnailUrl = text(body.post_thumbnail_url, 1000)
  const postCaption = text(body.post_caption, 2000)
  const aiTone = text(body.ai_tone, 40)
  const aiLength = text(body.ai_length, 40)
  const aiCustomInstructions = text(body.ai_custom_instructions, 2000)
  const replyMessages = stringList(body.reply_messages)
  const dmOpeningMessage = text(body.dm_opening_message, 1000)
  const dmButtonText = text(body.dm_button_text, 80)
  const dmLinkUrl = text(body.dm_link_url, 1000)
  const dmLinkMessage = text(body.dm_link_message, 1000)

  for (const node of graph.nodes) {
    const nodeType = String(node.data?.type || "")
    const config = nodeConfig(node)

    if (isTriggerNode(nodeType)) {
      config.social_account_id = context.socialAccountId
      config.platform = context.platform
      if (nodeType === "trigger_new_comment") {
        // Templates target one selected post; the explicit scope keeps graph
        // normalization from treating the default broad scope as intent.
        config.post_scope = "specific"
        config.post_id = postId
        config.post_thumbnail_url = postThumbnailUrl
        config.post_caption = postCaption
      }
    }

    if (nodeType === "action_ai_response") {
      if (aiTone) config.tone = aiTone
      if (aiLength) config.length = aiLength
      if (aiCustomInstructions) config.custom_instructions = aiCustomInstructions
    }

    if (nodeType === "action_reply_comment" && replyMessages.length > 0) {
      config.messages = replyMessages
      config.use_ai_response = replyMessages.some((message) => message.includes("{{ai_response}}"))
    }

    if (nodeType === "action_send_dm") {
      if (dmOpeningMessage) config.opening_message = dmOpeningMessage
      if (dmButtonText) config.button_text = dmButtonText
      if (dmLinkUrl) config.link_url = dmLinkUrl
      if (dmLinkMessage) config.link_message = dmLinkMessage
    }
  }

  const delaySeconds = numberValue(body.delay_seconds)
  if (delaySeconds !== null) applyDelay(graph, delaySeconds)

  return { graph }
}
