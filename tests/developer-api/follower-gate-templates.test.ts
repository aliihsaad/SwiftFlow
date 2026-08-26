import { describe, expect, it } from 'vitest'

import { getAutomationTemplateById } from '@/lib/automation-templates'

describe('follower gate playbooks', () => {
  it('creates the comment entry journey with interactive private reply buttons', () => {
    const template = getAutomationTemplateById('tpl-follower-gate-comment-entry')
    const graph = template?.buildGraph()
    const privateReply = graph?.nodes.find((node) => node.data.type === 'action_private_reply')

    expect(privateReply?.data.config).toMatchObject({
      follower_gate_enabled: true,
      confirm_payload: 'I FOLLOWED',
    })
  })

  it('creates the verification journey with true and false follower branches', () => {
    const template = getAutomationTemplateById('tpl-follower-gate-verification')
    const graph = template?.buildGraph()
    const condition = graph?.nodes.find((node) => node.data.type === 'action_condition')
    const conditionEdges = graph?.edges.filter((edge) => edge.source === condition?.id)

    expect(condition?.data.config).toMatchObject({
      condition_type: 'instagram_follower_status',
    })
    expect(conditionEdges?.map((edge) => edge.sourceHandle).sort()).toEqual(['false', 'true'])
  })
})
