import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeEdgeFunction } from '@/supabase/functions/_shared/edge-invoke'
const graphModule = '../../supabase/functions/process-automations/graph-executor.ts'
const { executeWorkflowGraph } = await import(graphModule)
vi.mock('@/supabase/functions/_shared/edge-invoke', () => ({ invokeEdgeFunction: vi.fn() }))
vi.mock('@/supabase/functions/_shared/meta-account', () => ({
  decryptMetaAccountRow: async (row: unknown) => row,
  canManageCommentsWithMetaAccount: () => true,
  canManageMessagesWithMetaAccount: () => true,
  canReadCommentsWithMetaAccount: () => true,
}))
const campaign = '099cbfd8-df8d-430f-bebb-3d8278771a14'
const account = { id: 'account', account_id: '123', platform: 'instagram', access_token: 'fixture' }
const node = (id: string, type: string, config: Record<string, unknown> = {}) => ({ id, position: { x: 0, y: 0 }, data: { type, label: id, config } })
const automation = { id: 'verification', workspace_id: 'workspace', social_account_id: 'account', workflow_version_id: 'version', is_active: true, social_accounts: account,
  workflow_graph: { nodes: [node('trigger', 'trigger_new_message', { social_account_id: 'account' }),
    node('follow', 'action_condition', { condition_type: 'instagram_follower_status', operator: 'equals' }),
    node('deliver', 'action_send_dm', { resource_campaign_id: campaign, opening_message: 'Here is WinDock', link_url: 'https://windock.vercel.app' })],
  edges: [{ id: 'a', source: 'trigger', target: 'follow' }, { id: 'b', source: 'follow', target: 'deliver', sourceHandle: 'true' }] } }
function database() {
  let status = ''
  let budgetCalls = 0
  return {
    budgetCalls: () => budgetCalls,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'reserve_automation_runtime_budget') {
        budgetCalls++
        return { data: [{ allowed: true }], error: null }
      }
      if (name === 'claim_instagram_campaign_delivery') {
        if (status) return { data: { claimed: false, status }, error: null }
        status = 'sending'
        return { data: { claimed: true, claim_token: 'lease' }, error: null }
      }
      if (name === 'finish_instagram_campaign_delivery') status = String(args.p_status)
      return { data: true, error: null }
    },
    from: () => {
      const query = { select: () => query, eq: () => query,
        upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: { id: 'recovery', status: 'pending', expires_at: '2099-01-01' }, error: null }),
      }
      return query
    },
  }
}
beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('recovery uses the existing graph follower branch', () => {
  it.each([true, false])('follower result %s controls resource delivery', async follows => {
    vi.mocked(invokeEdgeFunction).mockImplementation(async name => ({ ok: true, status: 200, data:
      name === 'automation-worker-condition' ? { success: true, output: { conditionResult: follows } }
        : { success: true, dmSent: true, output: { channel: 'dm', messageId: 'resource' } } }))
    const result = await executeWorkflowGraph(database(), automation, { sender_id: 'recipient', recovery_id: 'recovery', recovery_campaign_id: campaign }, account, { runId: 'run' })
    expect(result.errors).toBe(0)
    expect(result.dmsSent).toBe(follows ? 1 : 0)
    const sends = vi.mocked(invokeEdgeFunction).mock.calls.filter(([name]) => name === 'automation-worker-send-dm')
    expect(sends).toHaveLength(follows ? 1 : 0)
    if (follows) expect(sends[0][1].config).toMatchObject({ atomic_resource_delivery: true, link_url: 'https://windock.vercel.app' })
  })
  it('the normal keyword path and recovery path compete for the same resource lock', async () => {
    vi.mocked(invokeEdgeFunction).mockImplementation(async name => ({ ok: true, status: 200, data:
      name === 'automation-worker-condition' ? { success: true, output: { conditionResult: true } }
        : { success: true, dmSent: true, output: { channel: 'dm', messageId: 'resource' } } }))
    const db = database()
    await executeWorkflowGraph(db, automation, { sender_id: 'recipient' }, account, { runId: 'normal' })
    const recovered = await executeWorkflowGraph(db, automation, { sender_id: 'recipient', recovery_id: 'recovery', recovery_campaign_id: campaign }, account, { runId: 'recovery' })
    expect(vi.mocked(invokeEdgeFunction).mock.calls.filter(([name]) => name === 'automation-worker-send-dm')).toHaveLength(1)
    expect(recovered.nodeResults.deliver.output.outcome).toBe('already_delivered_skipped')
    expect(recovered.dmsSent).toBe(0)
    expect(db.budgetCalls()).toBe(1)
  })
  it('a follower lookup error never reaches the resource node', async () => {
    vi.mocked(invokeEdgeFunction).mockResolvedValue({ ok: true, status: 200, data: { success: false, error: 'Follower lookup unavailable' } })
    const result = await executeWorkflowGraph(database(), automation, { sender_id: 'recipient' }, account, { runId: 'run' })
    expect(result.errors).toBe(1)
    expect(vi.mocked(invokeEdgeFunction).mock.calls.map(([name]) => name)).toEqual(['automation-worker-condition'])
  })
})
