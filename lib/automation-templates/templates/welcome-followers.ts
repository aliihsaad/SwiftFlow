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
  buildGraph: () => {
    const trigger = {
      key: 'trigger_follower',
      type: 'trigger_new_follower' as const,
      label: 'New Follower',
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
            opening_message: 'Welcome aboard! Thanks for following — let me know what you\'d like to see more of.',
            button_text: '',
            link_url: '',
            link_message: '',
          },
        },
      ],
      [{ source: 'trigger_follower', target: 'send_dm' }],
    )
  },
}
