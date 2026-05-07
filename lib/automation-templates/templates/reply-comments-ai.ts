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
  fields: [
    {
      id: 'platform',
      type: 'platform',
      label: 'Platform',
      defaultValue: 'instagram',
    },
    { id: 'social_account_id', type: 'social_account', label: 'Account', required: true },
    {
      id: 'post_id',
      type: 'post',
      label: 'Trigger post',
      required: true,
    },
    {
      id: 'tone',
      type: 'tone',
      label: 'AI tone',
      defaultValue: 'friendly',
    },
    {
      id: 'keywords',
      type: 'keywords',
      label: 'Only reply when comment contains',
      helpText: 'Leave empty to reply to every comment.',
      defaultValue: [],
    },
  ],
  defaultName: (values) => {
    const platform = values.platform === 'facebook' ? 'Facebook' : 'Instagram'
    return `${platform} — AI reply to comments`
  },
  buildGraphFromForm: (values) => {
    const platform = values.platform === 'facebook' ? 'facebook' : 'instagram'
    const triggerType = Array.isArray(values.keywords) && values.keywords.length > 0 ? 'keywords' : 'any'
    return buildGraphFromBlueprint(
      [
        {
          key: 'trigger_comment',
          type: 'trigger_new_comment',
          label: 'New Comment',
          position: { x: 100, y: 140 },
          config: {
            platform,
            trigger_type: triggerType,
            keywords: values.keywords || [],
            social_account_id: String(values.social_account_id || ''),
            post_id: String(values.post_id || ''),
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
            tone: values.tone || 'friendly',
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
            messages: ['{{ai_response}}'],
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'ai_response' },
        { source: 'ai_response', target: 'reply_comment' },
      ],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      platform: 'instagram',
      social_account_id: '',
      post_id: '',
      tone: 'friendly',
      keywords: [],
    })
  },
}
