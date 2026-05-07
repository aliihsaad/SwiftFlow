// lib/automation-templates/templates/reply-comments-ai.ts
import { MessageSquareReply } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const replyCommentsAi: AutomationTemplateDefinition = {
  id: 'tpl-reply-comments-ai',
  name: 'Reply to comments with AI',
  description: 'Auto-generate a friendly reply for every new comment on a specific post.',
  category: 'comments',
  icon: MessageSquareReply,
  supportedPlatforms: ['instagram', 'facebook'],
  tags: ['comments', 'ai', 'engagement'],
  buildGraph: () => {
    return buildGraphFromBlueprint(
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
          position: { x: 670, y: 120 },
          config: {
            use_ai_response: true,
            messages: ['{{ai_response}}', 'Thanks for your comment!'],
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'ai_response' },
        { source: 'ai_response', target: 'reply_comment' },
      ],
    )
  },
}
