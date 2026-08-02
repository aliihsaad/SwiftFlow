import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'

import { POST as validateAutomation } from '@/app/api/automations/validate/route'
import { validateDeveloperAutomationGraph } from '@/lib/developer-api/automation-graph'
import {
  getAutomationConditionPolicyIssue,
  SUPPORTED_AUTOMATION_CONDITION_TYPES,
} from '@/supabase/functions/_shared/automation-condition-policy'

const accountId = '22222222-2222-4222-8222-222222222222'

function conditionGraph(conditionType: string) {
  return {
    nodes: [
      {
        id: 'trigger-message',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: {
          type: 'trigger_new_message',
          label: 'New Message',
          config: {
            social_account_id: accountId,
            trigger_type: 'any',
          },
        },
      },
      {
        id: 'condition',
        type: 'action',
        position: { x: 360, y: 100 },
        data: {
          type: 'action_condition',
          label: 'Condition',
          config: {
            condition_type: conditionType,
            operator: 'greater_than',
            threshold: 10,
          },
        },
      },
    ],
    edges: [
      {
        id: 'edge-trigger-condition',
        source: 'trigger-message',
        target: 'condition',
      },
    ],
  }
}

describe('automation condition guardrails', () => {
  it('keeps keyword matching as the only supported condition baseline', () => {
    expect(SUPPORTED_AUTOMATION_CONDITION_TYPES).toEqual(['keyword_match'])
    expect(getAutomationConditionPolicyIssue('keyword_match')).toBeNull()
  })

  it.each(['follower_count', 'comment_count'])(
    'marks %s as temporarily disabled',
    (conditionType) => {
      expect(getAutomationConditionPolicyIssue(conditionType)).toMatchObject({
        code: 'CONDITION_TEMPORARILY_DISABLED',
      })
    },
  )

  it('rejects placeholder count conditions through the developer graph validator', () => {
    const { errors } = validateDeveloperAutomationGraph(conditionGraph('follower_count'))

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'CONDITION_TEMPORARILY_DISABLED',
        nodeId: 'condition',
      }),
    ]))
  })

  it('rejects placeholder count conditions through app activation validation', async () => {
    const response = await validateAutomation(new NextRequest('http://localhost/api/automations/validate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        workflow_graph: conditionGraph('comment_count'),
      }),
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'CONDITION_TEMPORARILY_DISABLED',
          nodeId: 'condition',
        }),
      ]),
    })
  })

  it('keeps the legacy executor fail-closed for unsupported condition types', () => {
    const source = readFileSync(
      'supabase/functions/process-automations/graph-executor.ts',
      'utf8',
    )

    expect(source).toContain('getAutomationConditionPolicyIssue')
    expect(source).not.toContain('conditionResult = true')
  })
})
