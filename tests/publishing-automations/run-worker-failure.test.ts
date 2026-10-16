import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { redactSensitiveLogValue, redactSensitiveString } from '@/supabase/functions/_shared/log-redaction'

// Execute the actual Deno entrypoint with controlled boundaries, including the
// PostgREST relationship ambiguity that a graph-only test cannot exercise.
const compiled = ts.transpileModule(readFileSync('supabase/functions/automation-worker-run/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function invoke(options: { lookupError?: string; graphError?: string; alreadyClaimed?: boolean; claimError?: boolean; saveError?: boolean } = {}) {
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error('Handler not registered') }
  const state: Record<string, unknown> = { status: 'queued', node_results: { preserved: { success: true } }, dms_sent_count: 0 }
  const writes: Array<{ patch: Record<string, unknown>; filters: Record<string, unknown> }> = []
  const graph = vi.fn(async () => {
    if (options.graphError) throw new Error(options.graphError)
    return { processed: 0, dmsSent: 0, errors: 0, nodeResults: {} }
  })
  const db = {
    from(table: string) {
      let patch: Record<string, unknown> | undefined
      let selection = ''
      const filters: Record<string, unknown> = {}
      const resolve = () => {
        if (table === 'automation_runs' && patch) {
          writes.push({ patch, filters: { ...filters } })
          if (patch.status === 'running') {
            if (options.claimError) return { data: null, error: { message: 'Claim unavailable' } }
            if (options.alreadyClaimed) return { data: [], error: null }
          }
          if (patch.status === 'failed' && options.saveError) return { data: null, error: { message: 'Persistence unavailable' } }
          Object.assign(state, patch)
          return { data: [{ id: 'run', workflow_version_id: 'version' }], error: null }
        }
        if (table === 'automations') {
          if (!selection.includes('social_accounts!automations_social_account_id_fkey') || options.lookupError) {
            return { data: null, error: { code: 'PGRST201', message: options.lookupError || 'More than one relationship was found' } }
          }
          return { data: { id: 'automation', workspace_id: 'workspace', editor_version: 'canvas', is_active: true, social_accounts: { access_token: 'test-only' } }, error: null }
        }
        if (table === 'automation_workflow_versions') return { data: { id: 'version', workflow_graph: { nodes: [], edges: [] } }, error: null }
        return { data: null, error: null }
      }
      const query = {
        update(value: Record<string, unknown>) { patch = value; return query },
        select(value: string) { selection = value; return query },
        eq(key: string, value: unknown) { filters[key] = value; return query },
        maybeSingle: async () => resolve(),
        then: (onResolve: (value: ReturnType<typeof resolve>) => unknown, onReject?: (error: unknown) => unknown) => Promise.resolve(resolve()).then(onResolve, onReject),
      }
      return query
    },
  }
  const dependencies: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: typeof handler) => { handler = fn } },
    'https://esm.sh/@supabase/supabase-js@2': { createClient: () => db },
    '../process-automations/graph-executor.ts': { executeWorkflowGraph: graph },
    '../_shared/internal-auth.ts': { assertInternalInvoke: async () => null },
    '../_shared/meta-account.ts': { decryptMetaAccountRow: async (row: unknown) => row },
    '../_shared/automation-context.ts': { enrichCommentPostContext: async (context: unknown) => context },
    '../_shared/log-redaction.ts': { redactSensitiveLogValue, redactSensitiveString },
    '../_shared/automation-node-runs.ts': { upsertAutomationNodeRuns: async () => undefined },
    '../_shared/resend-email.ts': { getAutomationFailureAlertRecipients: () => [] },
  }
  runInNewContext(compiled, { exports: {}, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`)
    return dependencies[id]
  }, Request, Response, console: { error: vi.fn() }, Deno: { env: { get: () => 'test-only' } } })
  const response = await handler(new Request('http://worker.test', { method: 'POST', body: JSON.stringify({ run_id: 'run', automation_id: 'automation', workspace_id: 'workspace' }) }))
  return { response, state, writes, graph }
}

describe('run worker account lookup and fatal failures', () => {
  it('uses the direct account relationship and executes the graph despite the new delivery join table', async () => {
    const result = await invoke()
    expect(result.response.status).toBe(200)
    expect(result.graph).toHaveBeenCalledOnce()
    expect(result.state.status).toBe('completed')
  })
  it('immediately fails a claimed run when account lookup fails, preserving checkpoints', async () => {
    const result = await invoke({ lookupError: 'PGRST201: ambiguous account relationship' })
    expect(result.response.status).toBe(500)
    expect(result.graph).not.toHaveBeenCalled()
    expect(result.state).toMatchObject({ status: 'failed', error_count: 1, node_results: { preserved: { success: true } } })
    expect(result.state.error_message).toContain('PGRST201')
    expect(result.writes.at(-1)?.filters).toEqual({ id: 'run', workspace_id: 'workspace', automation_id: 'automation', status: 'running' })
  })
  it('fails an unexpected graph exception without deleting checkpoints or requeueing', async () => {
    const result = await invoke({ graphError: 'Provider response persistence failed' })
    expect(result.state.status).toBe('failed')
    expect(result.state.node_results).toEqual({ preserved: { success: true } })
    expect(result.writes.some(w => w.patch.status === 'queued')).toBe(false)
  })
  it('does not alter another invocation’s claimed run', async () => {
    const result = await invoke({ alreadyClaimed: true })
    expect(result.response.status).toBe(200)
    expect(result.graph).not.toHaveBeenCalled()
    expect(result.writes).toHaveLength(1)
  })
  it('does not mark an unclaimed run failed when the claim request itself fails', async () => {
    const result = await invoke({ claimError: true })
    expect(result.response.status).toBe(500)
    expect(result.writes).toHaveLength(1)
    expect(result.state.status).toBe('queued')
  })
  it('redacts credentials before storing or returning an exception', async () => {
    const result = await invoke({ lookupError: 'Failed access_token=do-not-store Bearer do-not-store' })
    expect(result.state.error_message).not.toContain('do-not-store')
    expect(await result.response.text()).not.toContain('do-not-store')
  })
  it('returns the original failure if writing its terminal state also fails', async () => {
    const result = await invoke({ lookupError: 'Original failure', saveError: true })
    expect(result.response.status).toBe(500)
    expect(await result.response.text()).toContain('Original failure')
  })
})
