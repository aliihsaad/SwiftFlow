// lib/automation-templates/templates/private-reply-commenters.ts
import { Lock } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const privateReplyCommenters: AutomationTemplateDefinition = {
  id: 'tpl-private-reply-commenters',
  name: 'Private reply to commenters',
  description: 'Send a private DM reply directly off a comment trigger (Instagram only).',
  category: 'comments',
  icon: Lock,
  supportedPlatforms: ['instagram'],
  tags: ['comments', 'private-reply'],
  buildGraph: () => {
    const triggerNode = {
      key: 'trigger_comment',
      type: 'trigger_new_comment' as const,
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
    }
    return buildGraphFromBlueprint(
      [
        triggerNode,
        {
          key: 'private_reply',
          type: 'action_private_reply',
          label: 'Private Reply',
          position: { x: 380, y: 120 },
          config: { use_ai_response: false, message: 'Thanks for reaching out — sliding into your DMs now.' },
        },
      ],
      [{ source: 'trigger_comment', target: 'private_reply' }],
    )
  },
}
