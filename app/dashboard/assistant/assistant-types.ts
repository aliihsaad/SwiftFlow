import type { LucideIcon } from 'lucide-react'
import type { AssistantContextReceipt } from '@/lib/assistant/context-types'

export type AssistantMode = 'create' | 'improve' | 'analyze' | 'operate' | 'ask'

export type AssistantAction =
  | 'generate_ideas'
  | 'generate_caption'
  | 'generate_image'
  | 'generate_carousel'
  | 'brand_images'
  | 'improve_text'
  | 'analyze_workspace'
  | 'inspect_posts'
  | 'inspect_automations'
  | 'general_chat'

export type AssistantFunctionName =
  | 'chat-assistant'
  | 'generate-image'
  | 'generate-ideas'
  | 'generate-carousel'

export type AssistantConfidence = 'high' | 'medium' | 'low'

export interface AssistantIntent {
  mode: AssistantMode
  action: AssistantAction
  functionName: AssistantFunctionName
  confidence: AssistantConfidence
  needsClarification: boolean
}

export interface MessageImage {
  base64: string
  mimeType: string
  name: string
}

export type AssistantMessageType =
  | 'text'
  | 'content_cards'
  | 'carousel_slides'
  | 'image'
  | 'style_selector'
  | 'carousel_style_selector'
  | 'idea_options_selector'
  | 'brand_image_mode_selector'
  | 'brand_image_options'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
  type?: AssistantMessageType
  data?: any
  images?: MessageImage[]
  contextReceipt?: AssistantContextReceipt
}

export type AssistantFlowState =
  | 'idle'
  | 'awaiting_description'
  | 'awaiting_style'
  | 'awaiting_carousel_topic'
  | 'awaiting_carousel_style'
  | 'awaiting_idea_options'
  | 'awaiting_brand_image_mode'
  | 'awaiting_brand_image_upload'
  | 'awaiting_brand_image_options'

export interface AssistantModeMeta {
  id: AssistantMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export interface AssistantQuickStart {
  id: string
  mode: AssistantMode
  action: AssistantAction
  title: string
  description: string
  prompt: string
  functionName: AssistantFunctionName | 'brand-images'
  icon: LucideIcon
}
