// @ts-nocheck - Shared by Deno edge functions and Node tests

export interface AutomationEmailContext extends Record<string, unknown> {
  comment_id?: string
  post_id?: string
  commenter_id?: string
  commenter_username?: string
  comment_text?: string
  message_id?: string
  sender_id?: string
  sender_username?: string
  message_text?: string
  follower_id?: string
  follower_username?: string
  timestamp?: string
  ai_response?: string
  alert_error?: string
  alert_source_node_id?: string
  alert_source_node_type?: string
  alert_source_node_label?: string
  automation_id?: string
  automation_name?: string
  workspace_id?: string
  node_id?: string
  node_type?: string
  node_label?: string
  platform?: string
}

interface AutomationLike {
  id?: string
  name?: string
  workspace_id?: string
}

interface WorkflowNodeLike {
  id?: string
  data?: {
    type?: string
    label?: string
  }
}

export interface BuildAutomationEmailMessageInput {
  config: Record<string, unknown>
  context: AutomationEmailContext
  automation?: AutomationLike | null
  node?: WorkflowNodeLike | null
  workspaceId?: string | null
  automationId?: string | null
  automationName?: string | null
  nodeId?: string | null
  nodeType?: string | null
  nodeLabel?: string | null
  platform?: string | null
}

export interface BuiltAutomationEmailMessage {
  subject: string
  text: string
}

const SENSITIVE_KEY_PATTERN = /(token|secret|authorization|api[_-]?key|password|credential)/i

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function rawText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value)
    if (candidate) return candidate
  }
  return ''
}

function boolDefaultTrue(value: unknown): boolean {
  return value !== false
}

function truncate(value: string, maxLength = 2000): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 20).trim()}... [truncated]`
}

function buildTemplateContext(input: BuildAutomationEmailMessageInput): AutomationEmailContext {
  const context = { ...(input.context || {}) }
  const automation = input.automation || {}
  const node = input.node || {}

  return {
    ...context,
    automation_id: firstText(context.automation_id, input.automationId, automation.id),
    automation_name: firstText(context.automation_name, input.automationName, automation.name),
    workspace_id: firstText(context.workspace_id, input.workspaceId, automation.workspace_id),
    node_id: firstText(context.node_id, input.nodeId, node.id),
    node_type: firstText(context.node_type, input.nodeType, node.data?.type),
    node_label: firstText(context.node_label, input.nodeLabel, node.data?.label),
    platform: firstText(context.platform, input.platform),
  }
}

function usernameFromContext(ctx: AutomationEmailContext): string {
  return firstText(ctx.commenter_username, ctx.sender_username, ctx.follower_username)
}

function triggerType(ctx: AutomationEmailContext): string {
  if (ctx.comment_id || ctx.comment_text || ctx.commenter_id || ctx.commenter_username) return 'comment'
  if (ctx.message_id || ctx.message_text || ctx.sender_id || ctx.sender_username) return 'direct message'
  if (ctx.follower_id || ctx.follower_username) return 'new follower'
  return 'automation trigger'
}

function section(title: string, lines: Array<string | null | undefined>): string {
  const cleanLines = lines.map((line) => text(line)).filter(Boolean)
  if (!cleanLines.length) return ''
  return [title, ...cleanLines.map((line) => `- ${line}`)].join('\n')
}

function redactSensitive(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) return '[redacted]'
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item))
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {}
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = redactSensitive(childValue, childKey)
    }
    return output
  }
  return value
}

function safeJson(value: unknown): string {
  try {
    return truncate(JSON.stringify(redactSensitive(value), null, 2), 4000)
  } catch {
    return ''
  }
}

export function interpolateAutomationEmailTemplate(
  template: string,
  context: AutomationEmailContext,
): string {
  const ctx = context || {}
  const replacements: Record<string, string> = {
    comment_text: rawText(ctx.comment_text),
    message_text: rawText(ctx.message_text),
    username: usernameFromContext(ctx),
    ai_response: rawText(ctx.ai_response),
    alert_error: rawText(ctx.alert_error),
    alert_source_node_id: rawText(ctx.alert_source_node_id),
    alert_source_node_type: rawText(ctx.alert_source_node_type),
    alert_source_node_label: rawText(ctx.alert_source_node_label),
    post_id: rawText(ctx.post_id),
    comment_id: rawText(ctx.comment_id),
    commenter_id: rawText(ctx.commenter_id),
    message_id: rawText(ctx.message_id),
    sender_id: rawText(ctx.sender_id),
    follower_id: rawText(ctx.follower_id),
    timestamp: rawText(ctx.timestamp),
    automation_id: rawText(ctx.automation_id),
    automation_name: rawText(ctx.automation_name),
    workspace_id: rawText(ctx.workspace_id),
    node_id: rawText(ctx.node_id),
    node_label: rawText(ctx.node_label),
    node_type: rawText(ctx.node_type),
    platform: rawText(ctx.platform),
  }

  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    return replacements[key] ?? ''
  })
}

function alertDetails(ctx: AutomationEmailContext): string {
  if (!ctx.alert_error && !ctx.alert_source_node_id && !ctx.alert_source_node_label) return ''

  return section('Alert details', [
    ctx.alert_source_node_label ? `Failed node: ${ctx.alert_source_node_label}` : null,
    ctx.alert_source_node_type ? `Failed node type: ${ctx.alert_source_node_type}` : null,
    ctx.alert_source_node_id ? `Failed node ID: ${ctx.alert_source_node_id}` : null,
    ctx.alert_error ? `Error: ${ctx.alert_error}` : null,
  ])
}

function triggerDetails(ctx: AutomationEmailContext): string {
  const username = usernameFromContext(ctx)
  const lines = [
    `Trigger: ${triggerType(ctx)}`,
    username ? `Username: ${username}` : null,
    firstText(ctx.commenter_id, ctx.sender_id, ctx.follower_id)
      ? `User ID: ${firstText(ctx.commenter_id, ctx.sender_id, ctx.follower_id)}`
      : null,
    firstText(ctx.comment_text, ctx.message_text)
      ? `Text: ${firstText(ctx.comment_text, ctx.message_text)}`
      : null,
    ctx.post_id ? `Post ID: ${ctx.post_id}` : null,
    ctx.comment_id ? `Comment ID: ${ctx.comment_id}` : null,
    ctx.message_id ? `Message ID: ${ctx.message_id}` : null,
    ctx.timestamp ? `Timestamp: ${ctx.timestamp}` : null,
  ]
  return section('Trigger details', lines)
}

function aiDetails(ctx: AutomationEmailContext): string {
  if (!text(ctx.ai_response)) return ''
  return section('AI output', [
    `Response: ${ctx.ai_response}`,
  ])
}

function automationDetails(ctx: AutomationEmailContext): string {
  return section('Automation context', [
    ctx.automation_name ? `Automation: ${ctx.automation_name}` : null,
    ctx.automation_id ? `Automation ID: ${ctx.automation_id}` : null,
    ctx.workspace_id ? `Workspace ID: ${ctx.workspace_id}` : null,
    ctx.platform ? `Platform: ${ctx.platform}` : null,
    ctx.node_label ? `Node: ${ctx.node_label}` : null,
    ctx.node_type ? `Node type: ${ctx.node_type}` : null,
    ctx.node_id ? `Node ID: ${ctx.node_id}` : null,
  ])
}

function technicalDetails(ctx: AutomationEmailContext): string {
  const payload = safeJson(ctx)
  if (!payload) return ''
  return ['Technical details', payload].join('\n')
}

export function buildAutomationEmailMessage(input: BuildAutomationEmailMessageInput): BuiltAutomationEmailMessage {
  const config = input.config || {}
  const context = buildTemplateContext(input)
  const includeContext = boolDefaultTrue(config.include_context)
  const includeTechnicalDetails = config.include_technical_details === true || Boolean(context.alert_error)

  const subject = interpolateAutomationEmailTemplate(String(config.subject || ''), context).trim()
  const intro = interpolateAutomationEmailTemplate(String(config.body || ''), context).trim()
  const blocks: string[] = []

  if (intro) blocks.push(intro)

  if (includeContext) {
    const alert = alertDetails(context)
    if (alert) blocks.push(alert)

    const trigger = triggerDetails(context)
    if (trigger) blocks.push(trigger)

    const ai = aiDetails(context)
    if (ai) blocks.push(ai)

    const automation = automationDetails(context)
    if (automation) blocks.push(automation)

    if (includeTechnicalDetails) {
      const technical = technicalDetails(context)
      if (technical) blocks.push(technical)
    }
  }

  if (blocks.length > 0) {
    blocks.push('---\nSent by SwiftFlow Automation')
  }

  return {
    subject,
    text: blocks.join('\n\n').trim(),
  }
}
