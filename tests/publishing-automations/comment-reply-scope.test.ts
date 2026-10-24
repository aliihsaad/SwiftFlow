import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as replyPolicy from '@/supabase/functions/_shared/comment-reply-policy'
import { interpolateTemplate } from '@/supabase/functions/_shared/automation-context'
import { normalizeMetaMessagingError } from '@/supabase/functions/_shared/meta-messaging-error'
import { getDefaultConfig } from '@/types/automation-graph'
import { validateDeveloperAutomationGraph } from '@/lib/developer-api/automation-graph'

function compile(source: string) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const compiledWorker = compile(readFileSync('supabase/functions/automation-worker-reply-comment/index.ts', 'utf8'))

async function invoke(config: Record<string, unknown>, context: Record<string, unknown>) {
  let handler: (request: Request) => Promise<Response> = async () => { throw new Error('Missing handler') }
  const fetch = vi.fn(async () => Response.json({ id: 'sent-reply' }))
  const dependencies: Record<string, unknown> = {
    'https://deno.land/std@0.168.0/http/server.ts': { serve: (fn: typeof handler) => { handler = fn } },
    '../_shared/internal-auth.ts': { assertInternalInvoke: async () => null },
    '../_shared/meta-messaging-error.ts': { normalizeMetaMessagingError },
    '../_shared/automation-context.ts': { interpolateTemplate },
    '../_shared/comment-reply-policy.ts': replyPolicy,
    '../_shared/meta-graph.ts': {
      getMetaGraphApiBaseUrl: () => 'https://graph.test',
      toMetaGraphFormBody: async (body: Record<string, string>) => new URLSearchParams(body),
    },
  }
  runInNewContext(compiledWorker, { exports: {}, require: (id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected import ${id}`)
    return dependencies[id]
  }, Request, Response, AbortSignal, fetch })
  const response = await handler(new Request('https://worker.test', { method: 'POST', body: JSON.stringify({
    config: { messages: ['Thanks!'], ...config },
    context: { comment_id: 'comment', ...context }, access_token: 'fixture', platform: 'instagram',
  }) }))
  return { data: await response.json(), fetch }
}

// Execute production functions with external boundaries stubbed, without
// importing the Deno-only dependencies of their enclosing modules.
function loadFunction(path: string, name: string, globals: Record<string, unknown>) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
  const declaration = source.statements.find((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === name)
  if (!declaration) throw new Error(`Missing function ${name}`)
  return runInNewContext(`${compile(declaration.getText(source))}\n${name}`, globals)
}

describe('reply only to top-level comments', () => {
  it.each([false, undefined])('keeps replying to nested comments when the toggle is %s', async top_level_only => {
    const result = await invoke({ top_level_only }, { parent_id: 'parent' })
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.data).toMatchObject({ success: true, output: { replyId: 'sent-reply' } })
  })

  it.each([undefined, null, ''])('replies to top-level comments with parent_id %s', async parent_id => {
    const result = await invoke({ top_level_only: true }, { parent_id })
    expect(result.fetch).toHaveBeenCalledOnce()
    expect(result.data.output.replyId).toBe('sent-reply')
  })

  it.each([false, true])('skips nested comments before sending, with AI replies %s', async use_ai_response => {
    const result = await invoke({ top_level_only: true, use_ai_response }, { parent_id: 'parent', ai_response: 'AI reply' })
    expect(result.fetch).not.toHaveBeenCalled()
    expect(result.data).toEqual(replyPolicy.skippedCommentReplyResult())
  })

  it('skips before reserving provider budget or invoking a worker and returns success for downstream nodes', async () => {
    const reserve = vi.fn()
    const execute = vi.fn()
    const budgetedNode = loadFunction('supabase/functions/process-automations/graph-executor.ts', 'executeBudgetedNode', {
      ...replyPolicy,
      GUARDED_RESOURCE_BY_NODE_TYPE: { action_reply_comment: 'provider_send' },
      reserveAutomationRuntimeBudget: reserve,
      executeNodeUnchecked: execute,
    })
    const result = await budgetedNode({}, {}, { data: { type: 'action_reply_comment', config: { top_level_only: true } } }, { parent_id: 'parent' }, {}, '')
    expect(result).toEqual(replyPolicy.skippedCommentReplyResult())
    expect(reserve).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })

  it.each(['parent', undefined])('preserves webhook parent_id %s when dispatching automations', async parent_id => {
    const orchestrator = vi.fn(async () => ({}))
    const legacy = vi.fn(async () => ({}))
    const handle = loadFunction('app/api/webhooks/instagram/route.ts', 'handleCommentEvent', {
      invokeAutomationOrchestrator: orchestrator,
      supabaseAdmin: { functions: { invoke: legacy } },
      console: { log: vi.fn(), error: vi.fn() },
    })
    await handle({ id: 'comment', parent_id, media: { id: 'post' }, from: { id: 'person' } }, {
      account_id: 'owner', workspace_id: 'workspace', social_account_id: 'account', platform: 'instagram',
    })
    const webhook_context = expect.objectContaining({ parent_id: parent_id ?? null })
    expect(orchestrator).toHaveBeenCalledWith(expect.objectContaining({ webhook_context }))
    expect(legacy).toHaveBeenCalledWith('process-automations', expect.objectContaining({
      body: expect.objectContaining({ webhook_context }),
    }))
  })

  it('defaults new reply nodes to the existing behavior', () => {
    expect(getDefaultConfig('action_reply_comment')).toMatchObject({ top_level_only: false })
  })

  it.each([true, false, 'true', 'false'])('preserves and normalizes the toggle %s in saved developer graphs', top_level_only => {
    const { graph, errors } = validateDeveloperAutomationGraph({
      nodes: [
        { id: 'trigger', type: 'trigger', position: { x: 0, y: 0 }, data: { type: 'trigger_new_comment', label: 'Comment', config: { social_account_id: 'account', post_scope: 'any', trigger_type: 'any' } } },
        { id: 'reply', type: 'action', position: { x: 250, y: 0 }, data: { type: 'action_reply_comment', label: 'Reply', config: { messages: ['Thanks!'], top_level_only } } },
      ],
      edges: [{ id: 'edge', source: 'trigger', target: 'reply' }],
    })
    expect(errors).toEqual([])
    expect(graph?.nodes[1].data.config).toHaveProperty('top_level_only', top_level_only === true || top_level_only === 'true')
  })
})
