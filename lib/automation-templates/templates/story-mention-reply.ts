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
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'use_ai', type: 'switch', label: 'Generate the reply with AI', defaultValue: false },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
      showWhen: { fieldId: 'use_ai', equals: true },
    },
    {
      id: 'opening_message',
      type: 'textarea',
      label: 'Reply message',
      defaultValue: 'Thanks for the story tag! 🙌',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Reply to story mentions',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const trigger = {
      key: 'trigger_mention',
      type: 'trigger_story_mention' as const,
      label: 'Story Mention',
      position: { x: 100, y: 130 },
      config: {
        platform: 'instagram',
        social_account_id: String(values.social_account_id || ''),
      },
    }
    if (useAi) {
      return buildGraphFromBlueprint(
        [
          trigger,
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 400, y: 110 },
            config: {
              use_global_settings: true,
              max_tokens: 400,
              preset_goal: 'reply_comment',
              tone: values.tone || 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'send_dm',
            type: 'action_send_dm',
            label: 'Send DM',
            position: { x: 700, y: 110 },
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
          { source: 'trigger_mention', target: 'ai_response' },
          { source: 'ai_response', target: 'send_dm' },
        ],
      )
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
            opening_message: String(values.opening_message || ''),
            button_text: '',
            link_url: '',
            link_message: '',
          },
        },
      ],
      [{ source: 'trigger_mention', target: 'send_dm' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      use_ai: false,
      opening_message: 'Thanks for the story tag! 🙌',
    })
  },
}
