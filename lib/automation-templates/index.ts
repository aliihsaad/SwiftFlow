// lib/automation-templates/index.ts
import { replyCommentsAi } from './templates/reply-comments-ai'
import { dmCommentersLink } from './templates/dm-commenters-link'
import { privateReplyCommenters } from './templates/private-reply-commenters'
import { dmAiAutoreply } from './templates/dm-ai-autoreply'
import { welcomeFollowers } from './templates/welcome-followers'
import { storyMentionReply } from './templates/story-mention-reply'

import type { AutomationTemplateDefinition } from './types'

export type { AutomationTemplateDefinition, AutomationTemplatePlatform } from './types'
export { buildGraphFromBlueprint, templateNode, templateEdge } from './utils'

export const AUTOMATION_TEMPLATES: AutomationTemplateDefinition[] = [
  replyCommentsAi,
  dmCommentersLink,
  privateReplyCommenters,
  dmAiAutoreply,
  welcomeFollowers,
  storyMentionReply,
]

export function getAutomationTemplateById(templateId: string) {
  return AUTOMATION_TEMPLATES.find((template) => template.id === templateId) || null
}
