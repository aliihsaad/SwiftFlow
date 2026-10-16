import { describe, expect, it } from 'vitest'
import { validateMessageTriggerCooldowns } from '@/supabase/functions/_shared/message-trigger-policy'

const graph = (value: unknown, type = 'trigger_new_message') => ({ nodes: [{ id: 'trigger', data: { type, config: { recipient_cooldown_seconds: value } } }] })

describe('message recipient cooldown configuration', () => {
  it.each([undefined, null, 0, 1, 60, 3600])('accepts automatic, disabled and bounded explicit settings: %s', value => {
    expect(validateMessageTriggerCooldowns(graph(value))).toEqual([])
  })
  it.each([-1, 0.5, 3601, '60', true, {}, Infinity, NaN])('rejects invalid settings: %s', value => {
    expect(validateMessageTriggerCooldowns(graph(value))).toHaveLength(1)
  })
  it('does not silently apply this setting to comment triggers', () => {
    expect(validateMessageTriggerCooldowns(graph(60, 'trigger_new_comment'))).toHaveLength(1)
  })
  it('accepts existing graphs without the new setting', () => {
    expect(validateMessageTriggerCooldowns({ nodes: [{ id: 'old', data: { type: 'trigger_new_message', config: { keywords: ['WinDock'] } } }] })).toEqual([])
  })
})
