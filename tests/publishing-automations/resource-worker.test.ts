import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { normalizeMetaMessagingError } from '@/supabase/functions/_shared/meta-messaging-error'

const compiled = ts.transpileModule(readFileSync('supabase/functions/automation-worker-send-dm/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

async function invoke(responses: Array<Response | Error>, config: Record<string, unknown> = {}) {
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error('Missing handler') }
  const fetch = vi.fn(async () => {
    const next = responses.shift()
    if (next instanceof Error) throw next
    if (!next) throw new Error('Unexpected extra provider send')
    return next
  })
  const requests: Record<string, unknown>[] = []
  const dependencies: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: typeof handler) => { handler = fn } },
    '../_shared/internal-auth.ts': { assertInternalInvoke: async () => null },
    '../_shared/meta-messaging-error.ts': { normalizeMetaMessagingError },
    '../_shared/automation-context.ts': { getRecipientId: () => 'recipient', interpolateTemplate: (text: string) => text },
    '../_shared/edge-invoke.ts': { invokeEdgeFunction: () => { throw new Error('Unexpected private reply') } },
    '../_shared/meta-graph.ts': { getMetaGraphApiBaseUrl: () => 'https://graph.test', toMetaGraphFormBody: async (body: Record<string, unknown>) => { requests.push(body); return 'fixture' } },
  }
  runInNewContext(compiled, { exports: {}, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`)
    return dependencies[id]
  }, Request, Response, AbortSignal, fetch })
  const response = await handler(new Request('https://worker.test', { method: 'POST', body: JSON.stringify({
    config: { atomic_resource_delivery: true, opening_message: 'Thanks for following!', link_url: 'https://example.com/resource', button_text: 'Get resource', ...config },
    context: { sender_id: 'recipient' }, access_token: 'fixture', page_id: 'account',
  }) }))
  return { response, data: await response.json(), requests, fetch }
}
const accepted = () => Response.json({ message_id: 'provider-id' })
describe('guarded resource worker', () => {
  it('sends the opening and resource in one accepted button message', async () => {
    const result = await invoke([accepted()])
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.requests[0].message).toMatchObject({ attachment: { payload: {
      text: 'Thanks for following!', buttons: [{ url: 'https://example.com/resource' }],
    } } })
    expect(result.data).toMatchObject({ success: true, dmSent: true, output: { messageId: 'provider-id' } })
  })
  it('preserves configured text fallback after an explicit bad-request rejection', async () => {
    const result = await invoke([Response.json({ error: { code: 100, message: 'Invalid template' } }, { status: 400 }), accepted()])
    expect(result.fetch).toHaveBeenCalledTimes(2)
    expect(result.requests[1].message).toEqual({ text: 'Thanks for following!\n\nhttps://example.com/resource' })
    expect(result.data.success).toBe(true)
  })
  it.each([
    ['rate limit', { code: 4 }, 400], ['HTTP rate limit', { code: 999 }, 429],
    ['authentication', { code: 190 }, 400], ['transient', { is_transient: true }, 400],
    ['server error', { code: 2 }, 500], ['permission', { code: 200 }, 403],
  ])('does not retry a %s rejection as text', async (_label, error, status) => {
    const result = await invoke([Response.json({ error }, { status: Number(status) })])
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.data.success).toBe(false)
  })
  it.each([new Error('timeout'), new Response('unreadable'), Response.json({})])('never repeats an uncertain send', async response => {
    const result = await invoke([response])
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.data.success).toBe(false)
  })
  it('respects disabled text fallback', async () => {
    const result = await invoke([Response.json({ error: { code: 100 } }, { status: 400 })], { cta_button_fallback_to_text: false })
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.data.success).toBe(false)
  })
  it('keeps the existing unguarded two-message path unchanged', async () => {
    const result = await invoke([accepted(), accepted()], { atomic_resource_delivery: false })
    expect(result.fetch).toHaveBeenCalledTimes(2)
    expect(result.requests[0].message).toEqual({ text: 'Thanks for following!' })
    expect(result.data.success).toBe(true)
  })
})
