// lib/automation-templates/types.ts
import type { LucideIcon } from 'lucide-react'
import type { WorkflowGraph } from '@/types/automation-graph'

export type AutomationTemplatePlatform = 'instagram' | 'facebook'

export interface AutomationTemplateDefinition {
  id: string
  name: string
  description: string
  category: 'comments' | 'messages' | 'growth' | 'mentions'
  icon: LucideIcon
  supportedPlatforms: AutomationTemplatePlatform[]
  tags?: string[]
  buildGraph: () => WorkflowGraph
}
