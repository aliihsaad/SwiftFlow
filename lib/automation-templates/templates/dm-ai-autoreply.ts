// lib/automation-templates/templates/dm-ai-autoreply.ts
import { Sparkles } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const dmAiAutoreply: AutomationTemplateDefinition = {
  id: 'tpl-dm-ai-autoreply',
  name: 'AI auto-reply to DMs',
  description: 'Respond to incoming Instagram DMs with an AI-generated reply.',
  category: 'messages',
  icon: Sparkles,
  supportedPlatforms: ['instagram'],
  tags: ['dm', 'ai', 'support'],
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'tone', type: 'tone', label: 'AI tone', defaultValue: 'friendly' },
  ],
  defaultName: () => 'IG — AI auto-reply to DMs',
  buildGraphFromForm: (values) => buildGraphFromBlueprint(
    [
      {
        key: 'trigger_message',
        type: 'trigger_new_message',
        label: 'New Message',
        position: { x: 100, y: 130 },
        config: {
          platform: 'instagram',
          trigger_type: 'any',
          keywords: [],
          social_account_id: String(values.social_account_id || ''),
        },
      },
      {
        key: 'ai_response',
        type: 'action_ai_response',
        label: 'AI Response',
        position: { x: 400, y: 110 },
        config: {
          use_global_settings: true,
          max_tokens: 600,
          preset_goal: 'support_answer',
          tone: values.tone || 'friendly',
          length: 'medium',
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
      { source: 'trigger_message', target: 'ai_response' },
      { source: 'ai_response', target: 'send_dm' },
    ],
  ),
  buildGraph: function () {
    return this.buildGraphFromForm({ social_account_id: '', tone: 'friendly' })
  },
}
