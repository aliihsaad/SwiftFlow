// lib/automation-templates/templates/story-mention-reply.ts
import { AtSign } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const storyMentionReply: AutomationTemplateDefinition = {
  id: 'tpl-story-mention-reply',
  name: 'Reply to story mentions',
  description: 'Auto-DM the person who tagged you in their Instagram story.',
  category: 'mentions',
  icon: AtSign,
  supportedPlatforms: ['instagram'],
  tags: ['stories', 'mentions', 'dm'],
  buildGraph: () => {
    const trigger = {
      key: 'trigger_mention',
      type: 'trigger_story_mention' as const,
      label: 'Story Mention',
      position: { x: 100, y: 130 },
      config: {
        platform: 'instagram',
        social_account_id: '',
      },
    }
    return buildGraphFromBlueprint(
      [
        trigger,
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 400, y: 110 },
          config: {
            use_ai_response: false,
            opening_message: 'Thanks for the story tag! 🙌',
            button_text: '',
            link_url: '',
            link_message: '',
          },
        },
      ],
      [{ source: 'trigger_mention', target: 'send_dm' }],
    )
  },
}
