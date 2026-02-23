import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowNodeType,
} from '@/types/automation-graph'
import { getDefaultConfig } from '@/types/automation-graph'

export type AutomationTemplatePlatform = 'instagram' | 'facebook'

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'comments' | 'messages' | 'growth'
  supportedPlatforms: AutomationTemplatePlatform[]
  tags?: string[]
  buildGraph: () => WorkflowGraph
}

function templateNode(
  id: string,
  type: WorkflowNodeType,
  label: string,
  position: { x: number; y: number },
  configOverrides: Record<string, unknown> = {},
): WorkflowNode {
  const baseConfig = getDefaultConfig(type) as unknown as Record<string, unknown>
  return {
    id,
    type: type.startsWith('trigger_') ? 'trigger' : 'action',
    position,
    data: {
      type,
      label,
      config: { ...baseConfig, ...configOverrides },
    } as unknown as WorkflowNodeData,
  }
}

function templateEdge(id: string, source: string, target: string, label?: string): WorkflowEdge {
  return {
    id,
    source,
    target,
    type: 'custom',
    animated: true,
    data: label ? { label } : undefined,
  }
}

function buildGraphFromBlueprint(
  nodesBlueprint: Array<{
    key: string
    type: WorkflowNodeType
    label: string
    position: { x: number; y: number }
    config?: Record<string, unknown>
  }>,
  edgesBlueprint: Array<{ source: string; target: string; label?: string }>,
): WorkflowGraph {
  const prefix = `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const keyToId = new Map<string, string>()
  const nodes: WorkflowNode[] = nodesBlueprint.map((node) => {
    const id = `${prefix}-${node.key}`
    keyToId.set(node.key, id)
    return templateNode(id, node.type, node.label, node.position, node.config || {})
  })

  const edges: WorkflowEdge[] = edgesBlueprint.map((edge, index) =>
    templateEdge(
      `${prefix}-edge-${index + 1}`,
      keyToId.get(edge.source) || edge.source,
      keyToId.get(edge.target) || edge.target,
      edge.label,
    ),
  )

  return { nodes, edges }
}

export const AUTOMATION_TEMPLATES: AutomationTemplateDefinition[] = [
  {
    id: 'comment-reply-dm-starter',
    name: 'Comment -> Reply + DM',
    description:
      'Reply to a new comment and send a follow-up DM. Good starter template for lead magnets and FAQ replies.',
    category: 'comments',
    supportedPlatforms: ['instagram', 'facebook'],
    tags: ['comments', 'dm', 'lead magnet'],
    buildGraph: () =>
      buildGraphFromBlueprint(
        [
          {
            key: 'trigger_comment',
            type: 'trigger_new_comment',
            label: 'New Comment',
            position: { x: 120, y: 120 },
            config: {
              platform: 'instagram',
              trigger_type: 'any',
              keywords: [],
              social_account_id: '',
              post_id: '',
              post_thumbnail_url: '',
              post_caption: '',
            },
          },
          {
            key: 'reply_comment',
            type: 'action_reply_comment',
            label: 'Reply to Comment',
            position: { x: 420, y: 100 },
            config: {
              use_ai_response: false,
              messages: ['Thanks for your comment. Check your inbox.'],
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 720, y: 100 },
            config: {
              use_ai_response: false,
              opening_message: 'Thanks for commenting. Here is the link you requested.',
              button_text: 'Open Link',
              link_url: 'https://example.com',
              link_message: 'If the button does not work, use this link: https://example.com',
            },
          },
        ],
        [
          { source: 'trigger_comment', target: 'reply_comment' },
          { source: 'reply_comment', target: 'send_dm' },
        ],
      ),
  },
  {
    id: 'comment-ai-reply-dm',
    name: 'Comment -> AI Reply + DM',
    description:
      'Generate an AI response first, then reuse it for comment reply and DM follow-up. Works for IG and Facebook comments.',
    category: 'comments',
    supportedPlatforms: ['instagram', 'facebook'],
    tags: ['comments', 'ai', 'dm'],
    buildGraph: () =>
      buildGraphFromBlueprint(
        [
          {
            key: 'trigger_comment',
            type: 'trigger_new_comment',
            label: 'New Comment',
            position: { x: 100, y: 140 },
            config: {
              platform: 'instagram',
              trigger_type: 'any',
              keywords: [],
              social_account_id: '',
              post_id: '',
              post_thumbnail_url: '',
              post_caption: '',
            },
          },
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 380, y: 120 },
            config: {
              use_global_settings: true,
              max_tokens: 500,
              preset_goal: 'reply_comment',
              tone: 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'reply_comment',
            type: 'action_reply_comment',
            label: 'Reply to Comment',
            position: { x: 670, y: 70 },
            config: {
              use_ai_response: true,
              messages: ['{{ai_response}}'],
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 670, y: 190 },
            config: {
              use_ai_response: true,
              opening_message: '{{ai_response}}',
              button_text: '',
              link_url: '',
              link_message: '',
            },
          },
        ],
        [
          { source: 'trigger_comment', target: 'ai_response' },
          { source: 'ai_response', target: 'reply_comment' },
          { source: 'reply_comment', target: 'send_dm' },
        ],
      ),
  },
  {
    id: 'new-message-ai-autoreply',
    name: 'New Message -> AI Auto Reply',
    description:
      'Respond to incoming DMs/messages using AI with your workspace settings. Good default support/FAQ responder.',
    category: 'messages',
    supportedPlatforms: ['instagram', 'facebook'],
    tags: ['messages', 'ai', 'support'],
    buildGraph: () =>
      buildGraphFromBlueprint(
        [
          {
            key: 'trigger_message',
            type: 'trigger_new_message',
            label: 'New Message',
            position: { x: 120, y: 130 },
            config: {
              platform: 'instagram',
              trigger_type: 'any',
              keywords: [],
              social_account_id: '',
            },
          },
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 430, y: 110 },
            config: {
              use_global_settings: true,
              max_tokens: 600,
              preset_goal: 'support_answer',
              tone: 'friendly',
              length: 'medium',
              emoji_level: 'light',
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 740, y: 110 },
            config: {
              use_ai_response: true,
              opening_message: '{{ai_response}}',
              button_text: '',
              link_url: '',
              link_message: '',
            },
          },
        ],
        [
          { source: 'trigger_message', target: 'ai_response' },
          { source: 'ai_response', target: 'send_dm' },
        ],
      ),
  },
  {
    id: 'new-message-delay-ai-reply',
    name: 'New Message -> Delay -> AI Reply',
    description:
      'Wait a short time before sending an AI-generated reply. Useful when you want a less instant response behavior.',
    category: 'messages',
    supportedPlatforms: ['instagram', 'facebook'],
    tags: ['messages', 'delay', 'ai'],
    buildGraph: () =>
      buildGraphFromBlueprint(
        [
          {
            key: 'trigger_message',
            type: 'trigger_new_message',
            label: 'New Message',
            position: { x: 80, y: 130 },
            config: {
              platform: 'instagram',
              trigger_type: 'any',
              keywords: [],
              social_account_id: '',
            },
          },
          {
            key: 'delay',
            type: 'action_delay',
            label: 'Delay',
            position: { x: 350, y: 110 },
            config: {
              duration_value: 30,
              duration_unit: 'seconds',
            },
          },
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 620, y: 110 },
            config: {
              use_global_settings: true,
              max_tokens: 500,
              preset_goal: 'support_answer',
              tone: 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 890, y: 110 },
            config: {
              use_ai_response: true,
              opening_message: '{{ai_response}}',
              button_text: '',
              link_url: '',
              link_message: '',
            },
          },
        ],
        [
          { source: 'trigger_message', target: 'delay' },
          { source: 'delay', target: 'ai_response' },
          { source: 'ai_response', target: 'send_dm' },
        ],
      ),
  },
]

export function getAutomationTemplateById(templateId: string) {
  return AUTOMATION_TEMPLATES.find((template) => template.id === templateId) || null
}
