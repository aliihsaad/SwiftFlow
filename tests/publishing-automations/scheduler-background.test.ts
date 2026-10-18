import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const compiled = ts.transpileModule(readFileSync('supabase/functions/scheduler-tick/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function setup(background = true, minute = 12) {
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error('Missing handler') }
  let finish!: (result: { ok: boolean; status: number; error?: string }) => void
  const pending = new Promise<{ ok: boolean; status: number; error?: string }>(resolve => { finish = resolve })
  const invoke = vi.fn((_job: string, _payload: Record<string, unknown>, _options: { timeoutMs: number }) => pending), error = vi.fn()
  const promises: Promise<Response>[] = []
  class FixedDate extends Date {
    constructor(value: number = Date.UTC(2026, 9, 18, 15, minute)) { super(value) }
    static now() { return Date.UTC(2026, 9, 18, 15, minute) }
  }
  const dependencies: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: typeof handler) => { handler = fn } },
    '../_shared/edge-invoke.ts': { invokeEdgeFunction: invoke },
    '../_shared/scheduler-logging.ts': { shouldLogSchedulerSuccess: () => true },
  }
  runInNewContext(compiled, { exports: {}, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`)
    return dependencies[id]
  }, Request, Response, Date: FixedDate, console: { error, log: vi.fn() },
  ...(background ? { EdgeRuntime: { waitUntil: (promise: Promise<Response>) => promises.push(promise) } } : {}) })
  return { handler, finish, invoke, promises, error }
}
describe('scheduler acknowledges work while retaining bounded background execution', () => {
  it('returns 202 before a slow resume finishes, with no retry or false success', async () => {
    const task = setup()
    const response = await task.handler(new Request('https://scheduler.test', { method: 'POST' }))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: true, started_at: '2026-10-18T15:12:00.000Z' })
    expect(task.invoke).toHaveBeenCalledExactlyOnceWith('process-scheduled-executions', {}, { timeoutMs: 120_000 })
    expect(task.promises).toHaveLength(1)
    task.finish({ ok: true, status: 200 })
    expect((await task.promises[0]).status).toBe(200)
  })
  it('logs eventual worker failure without replaying the work', async () => {
    const task = setup()
    await task.handler(new Request('https://scheduler.test'))
    task.finish({ ok: false, status: 500, error: 'Timeout' })
    expect((await task.promises[0]).status).toBe(207)
    expect(task.error).toHaveBeenCalledWith('[SCHEDULER_TICK] Job failed', expect.objectContaining({ error: 'Timeout' }))
    expect(task.invoke).toHaveBeenCalledOnce()
  })
  it('an unexpected invocation rejection does not abandon the other hourly job', async () => {
    const task = setup(true, 0)
    task.invoke.mockRejectedValueOnce(new Error('Unexpected connection failure'))
    await task.handler(new Request('https://scheduler.test'))
    let completed = false
    task.promises[0].then(() => { completed = true })
    await Promise.resolve()
    expect(completed).toBe(false)
    task.finish({ ok: true, status: 200 })
    expect((await task.promises[0]).status).toBe(207)
    expect(task.invoke).toHaveBeenCalledTimes(2)
  })
  it.each([[0, 'retention-cleanup'], [5, 'instagram-token-refresh'], [30, 'token-health-sweep']])('preserves hourly job at minute %s', async (minute, job) => {
    const task = setup(true, Number(minute))
    await task.handler(new Request('https://scheduler.test'))
    expect(task.invoke.mock.calls.map(call => call[0])).toEqual(['process-scheduled-executions', job])
    task.finish({ ok: true, status: 200 })
    await task.promises[0]
  })
  it('awaits results when the runtime has no background API', async () => {
    const task = setup(false)
    const response = task.handler(new Request('https://scheduler.test'))
    task.finish({ ok: true, status: 200 })
    expect((await response).status).toBe(200)
    expect(task.promises).toHaveLength(0)
  })
})
