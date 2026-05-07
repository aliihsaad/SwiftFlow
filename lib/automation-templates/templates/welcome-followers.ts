// lib/automation-templates/templates/welcome-followers.ts
import { UserPlus } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const welcomeFollowers: AutomationTemplateDefinition = {
  id: 'tpl-welcome-followers',
  name: 'Welcome new followers',
  description: 'Send a welcome DM the moment someone follows your Instagram account.',
  category: 'growth',
  icon: UserPlus,
  supportedPlatforms: ['instagram'],
  tags: ['followers', 'growth', 'dm'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'use_ai', type: 'switch', label: 'Generate the message with AI', defaultValue: false },
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
      label: 'Welcome message',
      defaultValue: 'Welcome aboard! Thanks for following — let me know what you'd like to see more of.',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Welcome new followers',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const trigger = {
      key: 'trigger_follower',
      type: 'trigger_new_follower' as const,
      label: 'New Follower',
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
              preset_goal: 'welcome_new_follower',
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
          { source: 'trigger_follower', target: 'ai_response' },
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
      [{ source: 'trigger_follower', target: 'send_dm' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      use_ai: false,
      opening_message: 'Welcome aboard!',
    })
  },
}
