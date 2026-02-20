import type { Node, Edge } from '@xyflow/react'

// ─── Trigger Node Types ────────────────────────────────────────────

export type TriggerNodeType =
  | 'trigger_new_comment'
  | 'trigger_new_message'
  | 'trigger_new_follower'
  | 'trigger_cron'
  | 'trigger_story_mention'
  | 'trigger_story_reply'

export interface TriggerNewCommentConfig {
  trigger_type: 'any' | 'keywords'
  keywords: string[]
  post_id: string
  post_thumbnail_url?: string
  post_caption?: string
  social_account_id: string
}

export interface TriggerNewMessageConfig {
  trigger_type: 'any' | 'keywords'
  keywords: string[]
  social_account_id: string
}

export interface TriggerNewFollowerConfig {
  social_account_id: string
}

export interface TriggerCronConfig {
  schedule: string // cron expression
  timezone: string
  social_account_id: string
}

export interface TriggerStoryMentionConfig {
  social_account_id: string
}

export interface TriggerStoryReplyConfig {
  social_account_id: string
}

export type TriggerConfig =
  | TriggerNewCommentConfig
  | TriggerNewMessageConfig
  | TriggerNewFollowerConfig
  | TriggerCronConfig
  | TriggerStoryMentionConfig
  | TriggerStoryReplyConfig

// ─── Action Node Types ─────────────────────────────────────────────

export type ActionNodeType =
  | 'action_send_dm'
  | 'action_private_reply'
  | 'action_reply_comment'
  | 'action_delay'
  | 'action_condition'
  | 'action_send_email'
  | 'action_http_request'
  | 'action_ai_response'

export interface ActionSendDMConfig {
  use_ai_response?: boolean
  use_ai_cta?: boolean
  cta_mode?: 'button' | 'text'
  cta_button_fallback_to_text?: boolean
  opening_message: string
  button_text?: string
  link_url?: string
  link_message?: string
  fallback_to_private_reply_on_failure?: boolean
  fallback_message?: string
}

export interface ActionPrivateReplyConfig {
  use_ai_response?: boolean
  message: string
}

export interface ActionReplyCommentConfig {
  use_ai_response?: boolean
  messages: string[] // random pick at runtime
}

export interface ActionDelayConfig {
  duration_value: number
  duration_unit: 'seconds' | 'minutes' | 'hours' | 'days'
}

export type ConditionOperator = 'contains' | 'not_contains' | 'equals' | 'greater_than' | 'less_than'

export interface ActionConditionConfig {
  condition_type: 'keyword_match' | 'follower_count' | 'comment_count'
  keywords?: string[]
  operator: ConditionOperator
  threshold?: number
}

export interface ActionSendEmailConfig {
  recipient_type: 'commenter' | 'custom'
  recipient_email?: string
  subject: string
  body: string
}

export interface ActionHttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  url: string
  headers?: Record<string, string>
  body?: string
}

export interface ActionAiResponseConfig {
  use_global_settings: boolean // true = use workspace AI settings, false = override below
  model?: string // only used when use_global_settings is false
  prompt_template?: string // optional override, presets can drive prompt generation
  max_tokens: number
  preset_goal?: 'auto' | 'reply_comment' | 'send_dm' | 'welcome_new_follower' | 'support_answer'
  tone?: 'friendly' | 'professional' | 'playful' | 'empathetic' | 'sales'
  length?: 'short' | 'medium' | 'long'
  language?: string
  emoji_level?: 'none' | 'light' | 'medium' | 'high'
  include_cta?: boolean
  cta_mode?: 'button' | 'text'
  cta_button_text?: string
  cta_link_url?: string
  cta_link_message?: string
  custom_instructions?: string
}

export type ActionConfig =
  | ActionSendDMConfig
  | ActionPrivateReplyConfig
  | ActionReplyCommentConfig
  | ActionDelayConfig
  | ActionConditionConfig
  | ActionSendEmailConfig
  | ActionHttpRequestConfig
  | ActionAiResponseConfig

// ─── Graph Node Data ───────────────────────────────────────────────

export type WorkflowNodeType = TriggerNodeType | ActionNodeType

export interface WorkflowNodeData {
  type: WorkflowNodeType
  label: string
  config: TriggerConfig | ActionConfig
  description?: string
  [key: string]: unknown // Required by React Flow's Record<string, unknown> constraint
}

export type WorkflowNode = Node<WorkflowNodeData, string>
export type WorkflowEdge = Edge<{ label?: string }>

// ─── Workflow Graph ────────────────────────────────────────────────

export interface WorkflowGraph {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

// ─── Execution Context ─────────────────────────────────────────────

export interface ExecutionContext {
  automation_id: string
  trigger_data: Record<string, unknown>
  variables: Record<string, unknown>
  node_outputs: Record<string, unknown> // nodeId → output
  current_node_id: string
}

// ─── AutomationV2 (extends existing type) ──────────────────────────

export interface AutomationV2 {
  id: string
  workspace_id: string
  social_account_id: string
  type: string
  name: string
  is_active: boolean
  platform_post_id?: string
  post_thumbnail_url?: string
  post_caption?: string
  // Legacy fields (wizard mode)
  trigger_config?: Record<string, unknown>
  comment_reply_config?: Record<string, unknown>
  dm_config?: Record<string, unknown>
  // New graph fields
  workflow_graph?: WorkflowGraph
  editor_version: 'wizard' | 'canvas'
  total_triggered: number
  total_dms_sent: number
  created_at: string
  updated_at: string
}

// ─── Scheduled Execution ───────────────────────────────────────────

export interface ScheduledExecution {
  id: string
  automation_id: string
  execution_id: string
  node_id: string
  execution_context: ExecutionContext
  scheduled_for: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  created_at: string
  executed_at?: string
}

// ─── Node Catalog (for sidebar) ────────────────────────────────────

export interface NodeCatalogEntry {
  type: WorkflowNodeType
  label: string
  description: string
  category: 'trigger' | 'action'
  icon: string // lucide icon name
  color: string
}

export const NODE_CATALOG: NodeCatalogEntry[] = [
  // Triggers
  {
    type: 'trigger_new_comment',
    label: 'New Comment',
    description: 'Triggers when a new comment is posted',
    category: 'trigger',
    icon: 'MessageCircle',
    color: '#3B82F6',
  },
  {
    type: 'trigger_new_message',
    label: 'New Message',
    description: 'Triggers when a new DM is received',
    category: 'trigger',
    icon: 'Mail',
    color: '#3B82F6',
  },
  {
    type: 'trigger_new_follower',
    label: 'New Follower',
    description: 'Triggers when someone follows your account',
    category: 'trigger',
    icon: 'UserPlus',
    color: '#3B82F6',
  },
  {
    type: 'trigger_cron',
    label: 'Schedule',
    description: 'Triggers on a recurring schedule',
    category: 'trigger',
    icon: 'Clock',
    color: '#3B82F6',
  },
  {
    type: 'trigger_story_mention',
    label: 'Story Mention',
    description: 'Triggers when someone mentions you in a story',
    category: 'trigger',
    icon: 'AtSign',
    color: '#3B82F6',
  },
  {
    type: 'trigger_story_reply',
    label: 'Story Reply',
    description: 'Triggers when someone replies to your story',
    category: 'trigger',
    icon: 'Reply',
    color: '#3B82F6',
  },
  // Actions
  {
    type: 'action_send_dm',
    label: 'Send DM',
    description: 'Send a direct message to the user',
    category: 'action',
    icon: 'Send',
    color: '#8B5CF6',
  },
  {
    type: 'action_private_reply',
    label: 'Private Reply',
    description: 'Reply privately to the triggering comment',
    category: 'action',
    icon: 'Reply',
    color: '#8B5CF6',
  },
  {
    type: 'action_reply_comment',
    label: 'Reply to Comment',
    description: 'Post a reply to the triggering comment',
    category: 'action',
    icon: 'MessageSquare',
    color: '#8B5CF6',
  },
  {
    type: 'action_delay',
    label: 'Delay',
    description: 'Wait for a specified duration before continuing',
    category: 'action',
    icon: 'Timer',
    color: '#F59E0B',
  },
  {
    type: 'action_condition',
    label: 'Condition',
    description: 'Branch the flow based on a condition',
    category: 'action',
    icon: 'GitBranch',
    color: '#10B981',
  },
  {
    type: 'action_send_email',
    label: 'Send Email',
    description: 'Send an email notification',
    category: 'action',
    icon: 'MailPlus',
    color: '#8B5CF6',
  },
  {
    type: 'action_http_request',
    label: 'HTTP Request',
    description: 'Make an HTTP request to an external API',
    category: 'action',
    icon: 'Globe',
    color: '#8B5CF6',
  },
  {
    type: 'action_ai_response',
    label: 'AI Response',
    description: 'Generate a response using AI',
    category: 'action',
    icon: 'Sparkles',
    color: '#EC4899',
  },
]

// ─── Helpers ───────────────────────────────────────────────────────

export function isTriggerNode(type: string): type is TriggerNodeType {
  return type.startsWith('trigger_')
}

export function isActionNode(type: string): type is ActionNodeType {
  return type.startsWith('action_')
}

export function getDefaultConfig(type: WorkflowNodeType): TriggerConfig | ActionConfig {
  switch (type) {
    case 'trigger_new_comment':
      return { trigger_type: 'any', keywords: [], post_id: '', social_account_id: '' } as TriggerNewCommentConfig
    case 'trigger_new_message':
      return { trigger_type: 'any', keywords: [], social_account_id: '' } as TriggerNewMessageConfig
    case 'trigger_new_follower':
      return { social_account_id: '' } as TriggerNewFollowerConfig
    case 'trigger_cron':
      return { schedule: '0 9 * * *', timezone: 'UTC', social_account_id: '' } as TriggerCronConfig
    case 'trigger_story_mention':
      return { social_account_id: '' } as TriggerStoryMentionConfig
    case 'trigger_story_reply':
      return { social_account_id: '' } as TriggerStoryReplyConfig
    case 'action_send_dm':
      return {
        use_ai_response: false,
        use_ai_cta: false,
        cta_mode: 'button',
        cta_button_fallback_to_text: true,
        opening_message: '',
        button_text: '',
        link_url: '',
        link_message: '',
        fallback_to_private_reply_on_failure: false,
        fallback_message: '',
      } as ActionSendDMConfig
    case 'action_private_reply':
      return { use_ai_response: false, message: '' } as ActionPrivateReplyConfig
    case 'action_reply_comment':
      return { use_ai_response: false, messages: [''] } as ActionReplyCommentConfig
    case 'action_delay':
      return { duration_value: 5, duration_unit: 'minutes' } as ActionDelayConfig
    case 'action_condition':
      return { condition_type: 'keyword_match', keywords: [], operator: 'contains' } as ActionConditionConfig
    case 'action_send_email':
      return { recipient_type: 'custom', subject: '', body: '' } as ActionSendEmailConfig
    case 'action_http_request':
      return { method: 'POST', url: '', headers: {}, body: '' } as ActionHttpRequestConfig
    case 'action_ai_response':
      return {
        use_global_settings: true,
        model: '',
        prompt_template: '',
        max_tokens: 500,
        preset_goal: 'auto',
        tone: 'friendly',
        length: 'short',
        language: 'same_as_user',
        emoji_level: 'light',
        include_cta: false,
        cta_mode: 'button',
        cta_button_text: '',
        cta_link_url: '',
        cta_link_message: '',
        custom_instructions: '',
      } as ActionAiResponseConfig
    default:
      return {} as ActionConfig
  }
}
