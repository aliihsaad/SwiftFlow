import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { invokeEdgeFunction } from '@/supabase/functions/_shared/edge-invoke'
import { isRetryableRuntimeGuard, scheduleAutomationContinuation } from '@/supabase/functions/_shared/automation-backpressure'
// These modules target Deno. Load them at runtime so Next's Node-only type
// checker does not attempt to typecheck the Edge dependency graph.
const graphModule = '../../supabase/functions/process-automations/graph-executor.ts'
const guardModule = '../../supabase/functions/_shared/automation-runtime-guard.ts'
const { executeWorkflowGraph, resumeFromDelay } = await import(graphModule)
const { resolveAutomationRuntimeGuardPolicy } = await import(guardModule)

vi.mock('@/supabase/functions/_shared/edge-invoke', () => ({ invokeEdgeFunction: vi.fn() }))
vi.mock('@/supabase/functions/_shared/meta-account', () => ({
  decryptMetaAccountRow: async (row: unknown) => row,
  canManageCommentsWithMetaAccount: () => true,
  canManageMessagesWithMetaAccount: () => true,
  canReadCommentsWithMetaAccount: () => true,
}))

const node = (id: string, type: string) => ({ id, data: { type, label: id, config: {} }, position: { x: 0, y: 0 } })
const account = { id: 'account', account_id: '123456', platform: 'instagram', access_token: 'test-only' }
const automation = {
  id: 'automation', workspace_id: 'workspace', social_account_id: account.id,
  workflow_version_id: 'version', is_active: true, social_accounts: account,
  workflow_graph: {
    nodes: [node('trigger', 'trigger_new_comment'), node('ai', 'action_ai_response'), node('reply', 'action_reply_comment'), node('dm', 'action_private_reply')],
    edges: [['trigger', 'ai'], ['ai', 'reply'], ['reply', 'dm']].map(([source, target]) => ({ id: `${source}-${target}`, source, target })),
  },
}

class RuntimeDb {
  queue: any[] = []
  events: any[] = []
  nodeRuns: any[] = []
  used = 0
  limit = 60
  denial = 'automation_budget_exhausted'
  blockAi = false
  scheduleError = false
  rpc = vi.fn(async (_name: string, args: any) => {
    if (_name !== 'reserve_automation_runtime_budget') return { error: null }
    const blocked = args.p_resource_kind === 'provider_send' ? this.used >= this.limit : this.blockAi
    if (!blocked && args.p_resource_kind === 'provider_send') this.used++
    return { data: [{ allowed: !blocked, reason: blocked ? this.denial : 'allowed', retry_after_seconds: 3600 }], error: null }
  })
  from(table: string): any {
    const db = this
    return {
      async insert(row: any) {
        if (db.scheduleError) return { error: { message: 'database unavailable' } }
        db.queue.push({ id: `schedule-${db.queue.length}-${crypto.randomUUID()}`, ...row })
        return { error: null }
      },
      async upsert(rows: any) {
        if (table === 'automation_execution_events') db.events.push(rows)
        else db.nodeRuns.push(...rows)
        return { error: null }
      },
      select() {
        const result = { eq: () => result, single: async () => ({ data: { ...automation }, error: null }),
          maybeSingle: async () => ({ data: { id: 'version', workflow_graph: automation.workflow_graph }, error: null }) }
        return result
      },
    }
  }
}

beforeEach(() => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(invokeEdgeFunction).mockImplementation(async (name, payload) => ({
    ok: true, status: 200,
    data: name === 'automation-worker-ai-response'
      ? { success: true, output: { response: `saved AI ${String((payload.context as any).comment_id)}` } }
      : { success: true, dmSent: name === 'automation-worker-private-reply', output: { sent: true } },
  }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('durable automation backpressure', () => {
  it('queues a blocked send, then resumes without regenerating AI or repeating the public reply', async () => {
    const db = new RuntimeDb(); db.limit = 1
    const first = await executeWorkflowGraph(db, automation, { comment_id: 'comment' }, account, { runId: 'run' })
    expect(first).toMatchObject({ errors: 0, pendingContinuations: 1 })
    expect(first.nodeResults.dm).toMatchObject({ deferred: true, output: { guarded: true } })
    expect(db.queue[0].execution_context).toMatchObject({ next_nodes: ['dm'], trigger_data: { ai_response: 'saved AI comment' } })
    expect(db.events.find(e => e.event_type === 'retry_scheduled')).toBeTruthy()
    db.used = 0
    const resumed = await resumeFromDelay(db, db.queue.shift())
    expect(resumed).toMatchObject({ errors: 0, pendingContinuations: 0, processed: 0, dmsSent: 1 })
    const calls = vi.mocked(invokeEdgeFunction).mock.calls
    expect(calls.map(c => c[0])).toEqual(['automation-worker-ai-response', 'automation-worker-reply-comment', 'automation-worker-private-reply'])
    expect((calls[2][1].context as any).ai_response).toBe('saved AI comment')
    expect(new Set(db.events.map(e => e.event_key)).size).toBe(db.events.length)
  })

  it('drains a 1,000-comment burst across budget windows with exactly one AI, reply and DM per comment', async () => {
    const db = new RuntimeDb()
    const results = await Promise.all(Array.from({ length: 1000 }, (_, i) =>
      executeWorkflowGraph(db, automation, { comment_id: `comment-${i}` }, account, { runId: `run-${i}` })))
    expect(results.every((r: any) => r.errors === 0)).toBe(true)
    let windows = 0
    while (db.queue.length && windows++ < 100) {
      db.used = 0
      const due = db.queue.splice(0)
      // The production scheduler claims four at a time.
      for (let i = 0; i < due.length; i += 4) {
        const resumed = await Promise.all(due.slice(i, i + 4).map(row => resumeFromDelay(db, row)))
        expect(resumed.every((r: any) => r.errors === 0)).toBe(true)
      }
      expect(db.used).toBeLessThanOrEqual(db.limit)
    }
    expect(db.queue).toHaveLength(0)
    const sends = new Map<string, number>()
    for (const [name, payload] of vi.mocked(invokeEdgeFunction).mock.calls) {
      const key = `${name}:${(payload.context as any).comment_id}`
      sends.set(key, (sends.get(key) || 0) + 1)
    }
    expect(sends.size).toBe(3000)
    expect([...sends.values()].every(count => count === 1)).toBe(true)
  }, 30_000)

  it('queues AI budget denials before generating anything', async () => {
    const db = new RuntimeDb(); db.blockAi = true
    const result = await executeWorkflowGraph(db, automation, {}, account, { runId: 'run' })
    expect(result).toMatchObject({ errors: 0, pendingContinuations: 1 })
    expect(invokeEdgeFunction).not.toHaveBeenCalled()
    expect(db.queue[0].execution_context.next_nodes).toEqual(['ai'])
  })

  it('reports a failed durable write instead of claiming the work was queued', async () => {
    const db = new RuntimeDb(); db.limit = 0; db.scheduleError = true
    const result = await executeWorkflowGraph(db, automation, {}, account, { runId: 'run' })
    expect(result).toMatchObject({ errors: 1, pendingContinuations: 0 })
    expect(db.queue).toHaveLength(0)
  })

  it('does not repeat a send through local fallback when the worker response is lost', async () => {
    const fetchSpy = vi.fn(); vi.stubGlobal('fetch', fetchSpy)
    vi.mocked(invokeEdgeFunction).mockResolvedValue({ ok: false, status: 504, error: 'response lost' })
    const graph = { ...automation, workflow_graph: { nodes: [node('trigger', 'trigger_new_comment'), node('dm', 'action_private_reply')], edges: [{ id: 'e', source: 'trigger', target: 'dm' }] } }
    const db = new RuntimeDb()
    const result = await executeWorkflowGraph(db, graph, {}, account, { runId: 'run' })
    expect(result).toMatchObject({ errors: 1, pendingContinuations: 0 })
    expect(result.nodeResults.dm.output).toMatchObject({ delivery_unconfirmed: true, automatic_retry: false })
    expect(invokeEdgeFunction).toHaveBeenCalledTimes(1)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('checkpoints long graphs before starting another provider operation', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    vi.mocked(invokeEdgeFunction).mockImplementation(async () => {
      now += 65_000
      return { ok: true, status: 200, data: { success: true, output: { response: 'cached' } } }
    })
    const db = new RuntimeDb()
    const result = await executeWorkflowGraph(db, automation, {}, account, { runId: 'run' })
    expect(result).toMatchObject({ errors: 0, pendingContinuations: 1 })
    expect(db.queue[0].execution_context).toMatchObject({ next_nodes: ['reply'], continuation_reason: 'worker_time_slice' })
    expect(invokeEdgeFunction).toHaveBeenCalledTimes(1)
  })

  it('preserves sibling branches and visited nodes while spreading retry times', async () => {
    const db = new RuntimeDb()
    await scheduleAutomationContinuation({ supabase: db, automation, runId: 'run', nodeId: 'blocked',
      remainingQueue: ['sibling'], visited: new Set(['done', 'blocked']), triggerContext: { ai_response: 'cached' },
      nodeOutputs: {}, deferred: { success: false, deferred: true, output: { reason: 'account_budget_exhausted', retry_after_seconds: 5 } }, now: 0, random: () => 0.5 })
    expect(db.queue[0]).toMatchObject({ scheduled_for: '1970-01-01T00:01:15.000Z', execution_context: { next_nodes: ['blocked', 'sibling'], visited_nodes: ['done'] } })
  })

  it('only retries known pre-send denials and preserves the account and AI safety budgets', () => {
    expect(isRetryableRuntimeGuard('account_circuit_probe_in_flight')).toBe(true)
    expect(isRetryableRuntimeGuard('runtime_guard_scope_missing')).toBe(false)
    expect(isRetryableRuntimeGuard('provider_timeout')).toBe(false)
    expect(resolveAutomationRuntimeGuardPolicy('provider_send')).toMatchObject({ accountLimit: 60, automationLimit: 60, windowSeconds: 3600 })
    expect(resolveAutomationRuntimeGuardPolicy('ai_generation')).toMatchObject({ accountLimit: 120, automationLimit: 60 })
    vi.stubGlobal('Deno', { env: { get: () => '' } })
    expect(resolveAutomationRuntimeGuardPolicy('provider_send').accountLimit).toBe(60)
  })
})
