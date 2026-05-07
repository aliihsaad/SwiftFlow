// lib/automation-templates/types.ts
import type { LucideIcon } from 'lucide-react'
import type { WorkflowGraph } from '@/types/automation-graph'

export type AutomationTemplatePlatform = 'instagram' | 'facebook'

export type TemplateFieldType =
  | 'social_account'
  | 'post_or_all'
  | 'text'
  | 'textarea'
  | 'url'
  | 'switch'
  | 'tone'
  | 'keywords'

export interface TemplateField {
  id: string
  type: TemplateFieldType
  label: string
  placeholder?: string
  helpText?: string
  required?: boolean
  defaultValue?: unknown
  // Platform attached to social_account fields so we know which API to call.
  platform?: AutomationTemplatePlatform
  // Simple conditional visibility: show only when another field equals a given value.
  showWhen?: { fieldId: string; equals: unknown }
}

export type TemplateFormValues = Record<string, unknown>

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'comments' | 'messages' | 'growth' | 'mentions'
  icon: LucideIcon
  supportedPlatforms: AutomationTemplatePlatform[]
  tags?: string[]
  fields: TemplateField[]
  buildGraphFromForm: (values: TemplateFormValues) => WorkflowGraph
  defaultName: (values: TemplateFormValues) => string
  // Kept for the existing canvas template picker. Returns a graph with
  // empty/default config for users who pick the template and want to
  // edit it on the canvas.
  buildGraph: () => WorkflowGraph
}
