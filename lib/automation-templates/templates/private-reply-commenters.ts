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
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    { id: 'post_or_all', type: 'post_or_all', label: 'Trigger post' },
    { id: 'use_ai', type: 'switch', label: 'Generate the reply with AI', defaultValue: false },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
      showWhen: { fieldId: 'use_ai', equals: true },
    },
    {
      id: 'message',
      type: 'textarea',
      label: 'Message',
      defaultValue: 'Thanks for reaching out — sliding into your DMs now.',
      showWhen: { fieldId: 'use_ai', equals: false },
    },
  ],
  defaultName: () => 'IG — Private reply to comments',
  buildGraphFromForm: (values) => {
    const useAi = Boolean(values.use_ai)
    const triggerNode = {
      key: 'trigger_comment',
      type: 'trigger_new_comment' as const,
      label: 'New Comment',
      position: { x: 100, y: 140 },
      config: {
        platform: 'instagram',
        trigger_type: 'any',
        keywords: [],
        social_account_id: String(values.social_account_id || ''),
        post_id: values.post_or_all === 'all' ? '' : String(values.post_id || ''),
        post_thumbnail_url: '',
        post_caption: '',
      },
    }
    if (useAi) {
      return buildGraphFromBlueprint(
        [
          triggerNode,
          {
            key: 'ai_response',
            type: 'action_ai_response',
            label: 'AI Response',
            position: { x: 380, y: 120 },
            config: {
              use_global_settings: true,
              max_tokens: 500,
              preset_goal: 'reply_comment',
              tone: values.tone || 'friendly',
              length: 'short',
              emoji_level: 'light',
            },
          },
          {
            key: 'private_reply',
            type: 'action_private_reply',
            label: 'Private Reply',
            position: { x: 670, y: 120 },
            config: { use_ai_response: true, message: '{{ai_response}}' },
          },
        ],
        [
          { source: 'trigger_comment', target: 'ai_response' },
          { source: 'ai_response', target: 'private_reply' },
        ],
      )
    }
    return buildGraphFromBlueprint(
      [
        triggerNode,
        {
          key: 'private_reply',
          type: 'action_private_reply',
          label: 'Private Reply',
          position: { x: 380, y: 120 },
          config: { use_ai_response: false, message: String(values.message || '') },
        },
      ],
      [{ source: 'trigger_comment', target: 'private_reply' }],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      post_or_all: 'all',
      post_id: '',
      use_ai: false,
      message: 'Thanks for reaching out — sliding into your DMs now.',
    })
  },
}
