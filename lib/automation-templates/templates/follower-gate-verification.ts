import { BadgeCheck } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const followerGateVerification: AutomationTemplateDefinition = {
  id: 'tpl-follower-gate-verification',
  name: 'Follower gate — verify & deliver',
  description: 'Recheck an I Followed confirmation, then deliver or ask the user to try again.',
  category: 'growth',
  icon: BadgeCheck,
  supportedPlatforms: ['instagram'],
  tags: ['followers', 'messages', 'lead magnet', 'step 2'],
  buildGraph: () => buildGraphFromBlueprint(
    [
      {
        key: 'trigger_confirmation',
        type: 'trigger_new_message',
        label: 'I Followed',
        position: { x: 80, y: 150 },
        config: {
          platform: 'instagram',
          trigger_type: 'keywords',
          keywords: ['I FOLLOWED'],
          social_account_id: '',
        },
      },
      {
        key: 'settle_delay',
        type: 'action_delay',
        label: 'Wait for Instagram',
        position: { x: 360, y: 130 },
        config: { duration_value: 3, duration_unit: 'seconds' },
      },
      {
        key: 'follower_check',
        type: 'action_condition',
        label: 'Follower Status',
        position: { x: 650, y: 120 },
        config: { condition_type: 'instagram_follower_status', operator: 'equals' },
      },
      {
        key: 'deliver_reward',
        type: 'action_send_dm',
        label: 'Deliver Resource',
        position: { x: 960, y: 40 },
        config: {
          use_ai_response: false,
          opening_message: 'Thanks for following — here is the resource you requested.',
          cta_mode: 'button',
          button_text: 'Open resource',
          link_url: 'https://example.com/resource',
          link_message: 'Your resource is ready.',
        },
      },
      {
        key: 'retry_follow',
        type: 'action_send_dm',
        label: 'Ask to Retry',
        position: { x: 960, y: 250 },
        config: {
          use_ai_response: false,
          opening_message: 'I cannot confirm the follow yet. Follow the account, wait a moment, then tap I Followed again.',
          cta_mode: 'button',
          button_text: 'Follow account',
          link_url: 'https://www.instagram.com/youraccount/',
          link_message: 'Open the Instagram profile and follow the account.',
        },
      },
    ],
    [
      { source: 'trigger_confirmation', target: 'settle_delay' },
      { source: 'settle_delay', target: 'follower_check' },
      { source: 'follower_check', target: 'deliver_reward', label: 'Following', sourceHandle: 'true' },
      { source: 'follower_check', target: 'retry_follow', label: 'Not following', sourceHandle: 'false' },
    ],
  ),
}
