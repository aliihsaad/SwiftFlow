// lib/automation-templates/templates/dm-commenters-link.ts
import { Send } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const dmCommentersLink: AutomationTemplateDefinition = {
  id: 'tpl-dm-commenters-link',
  name: 'DM commenters with a link',
  description: 'Reply publicly, then DM each commenter a button that opens your link.',
  category: 'comments',
  icon: Send,
  supportedPlatforms: ['instagram'],
  tags: ['comments', 'dm', 'lead magnet'],
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
          key: 'reply_comment',
          type: 'action_reply_comment',
          label: 'Reply to Comment',
          position: { x: 380, y: 100 },
          config: {
            use_ai_response: false,
            messages: ['Thanks for your comment. Check your inbox.'],
          },
        },
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 680, y: 100 },
          config: {
            use_ai_response: false,
            opening_message: 'Thanks for commenting. Here is the link you requested.',
            button_text: 'Open Link',
            link_url: 'https://example.com',
            link_message: 'If the button does not work, use this link: https://example.com',
            fallback_to_private_reply_on_failure: true,
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'reply_comment' },
        { source: 'reply_comment', target: 'send_dm' },
      ],
    )
  },
}
