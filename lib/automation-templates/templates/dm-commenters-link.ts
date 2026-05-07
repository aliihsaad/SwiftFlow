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
  fields: [
    {
      id: 'social_account_id',
      type: 'social_account',
      label: 'Instagram account',
      required: true,
      platform: 'instagram',
    },
    {
      id: 'post_id',
      type: 'post',
      label: 'Trigger post',
      required: true,
    },
    {
      id: 'reply_message',
      type: 'textarea',
      label: 'Public reply',
      defaultValue: 'Thanks for your comment. Check your inbox.',
      required: true,
    },
    {
      id: 'opening_message',
      type: 'textarea',
      label: 'DM opening message',
      defaultValue: 'Thanks for commenting. Here is the link you requested.',
      required: true,
    },
    { id: 'button_text', type: 'text', label: 'Button text', defaultValue: 'Open Link', required: true },
    { id: 'link_url', type: 'url', label: 'URL', required: true, placeholder: 'https://example.com' },
    {
      id: 'fallback_to_private_reply',
      type: 'switch',
      label: 'If DM fails, try a private reply instead',
      defaultValue: true,
    },
  ],
  defaultName: () => 'IG — DM commenters a link',
  buildGraphFromForm: (values) => {
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
            social_account_id: String(values.social_account_id || ''),
            post_id: String(values.post_id || ''),
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
            messages: [String(values.reply_message || '')],
          },
        },
        {
          key: 'send_dm',
          type: 'action_send_dm',
          label: 'Send DM',
          position: { x: 680, y: 100 },
          config: {
            use_ai_response: false,
            opening_message: String(values.opening_message || ''),
            button_text: String(values.button_text || ''),
            link_url: String(values.link_url || ''),
            link_message: `If the button does not work, use this link: ${String(values.link_url || '')}`,
            fallback_to_private_reply_on_failure: Boolean(values.fallback_to_private_reply),
          },
        },
      ],
      [
        { source: 'trigger_comment', target: 'reply_comment' },
        { source: 'reply_comment', target: 'send_dm' },
      ],
    )
  },
  buildGraph: function () {
    return this.buildGraphFromForm({
      social_account_id: '',
      post_id: '',
      reply_message: 'Thanks for your comment. Check your inbox.',
      opening_message: 'Thanks for commenting. Here is the link you requested.',
      button_text: 'Open Link',
      link_url: 'https://example.com',
      fallback_to_private_reply: true,
    })
  },
}
