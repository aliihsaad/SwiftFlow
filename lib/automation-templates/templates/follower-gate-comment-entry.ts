import { UserCheck } from 'lucide-react'
import type { AutomationTemplateDefinition } from '../types'
import { buildGraphFromBlueprint } from '../utils'

export const followerGateCommentEntry: AutomationTemplateDefinition = {
  id: 'tpl-follower-gate-comment-entry',
  name: 'Follower gate — comment entry',
  description: 'Turn a keyword comment into a private Follow + I Followed prompt.',
  category: 'growth',
  icon: UserCheck,
  supportedPlatforms: ['instagram'],
  tags: ['followers', 'comments', 'lead magnet', 'step 1'],
  buildGraph: () => buildGraphFromBlueprint(
    [
      {
        key: 'trigger_comment',
        type: 'trigger_new_comment',
        label: 'Keyword Comment',
        position: { x: 100, y: 140 },
        config: {
          platform: 'instagram',
          trigger_type: 'keywords',
          keywords: ['GUIDE'],
          post_scope: 'any',
          social_account_id: '',
        },
      },
      {
        key: 'private_reply',
        type: 'action_private_reply',
        label: 'Ask to Follow',
        position: { x: 410, y: 120 },
        config: {
          use_ai_response: false,
          message: 'Follow the account, then tap I Followed so I can verify and send your resource.',
          follower_gate_enabled: true,
          follow_button_text: 'Follow account',
          follow_profile_url: 'https://www.instagram.com/youraccount/',
          confirm_button_text: 'I Followed',
          confirm_payload: 'I FOLLOWED',
          button_fallback_to_text: true,
        },
      },
    ],
    [{ source: 'trigger_comment', target: 'private_reply' }],
  ),
}
