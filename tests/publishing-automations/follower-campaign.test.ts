import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFollowerCampaign } from '@/lib/automation-templates/follower-campaign'
import { keywordMatch } from '@/supabase/functions/_shared/automation-context'
import { POST } from '@/app/api/automations/route'
import type {
  ActionAiResponseConfig, ActionPrivateReplyConfig, ActionReplyCommentConfig,
  TriggerNewCommentConfig, TriggerNewMessageConfig, WorkflowGraph,
} from '@/types/automation-graph'

const state = vi.hoisted(() => ({
  user: true, account: true, permission: true, insertError: false,
  inserts: [] as Record<string, unknown>[][], filters: [] as [string, unknown][],
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user ? { id: 'user' } : null } }) },
  from: () => {
    let rows: unknown
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([key, value]); return query },
      single: async () => ({ data: state.account ? { id: 'account', platform: 'instagram', access_token: 'test' } : null }),
      insert: (data: Record<string, unknown>[]) => { rows = data; state.inserts.push(data); return query },
      then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: state.insertError ? { message: 'database error' } : null }),
    }
    return query
  },
}) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/billing/gate', () => ({ gateWorkspaceLimit: async () => null }))
vi.mock('@/lib/workspace-utils', () => ({ getActiveWorkspace: async () => ({ id: 'workspace' }), getExplicitActiveWorkspace: async () => ({ id: 'workspace' }) }))
vi.mock('@/lib/workspace-permissions', () => ({
  requireWorkspacePermission: async () => { if (!state.permission) throw new Error('forbidden') },
  getWorkspacePermissionErrorStatus: (error: Error) => error.message === 'forbidden' ? 403 : null,
}))
vi.mock('@/lib/meta-account', () => ({
  decryptMetaAccountRow: (row: unknown) => row,
  canManageMessagesWithMetaAccount: () => true, canReadCommentsWithMetaAccount: () => true,
}))

const input = {
  name: 'My reel', accountId: '22222222-2222-4222-8222-222222222222', postId: '18145399315590026',
  keyword: 'GUIDE', allComments: false, profileUsername: '@example', publicReply: 'Check your DMs',
  privateMessage: 'Follow to get the guide', deliveryMessage: 'Here is your guide',
  resourceUrl: 'https://example.com/guide', buttonText: 'Get the guide', useAiReply: false,
}
const confirmation = '11111111-1111-4111-8111-111111111111'
interface CampaignConfigs {
  action_ai_response: ActionAiResponseConfig
  action_private_reply: ActionPrivateReplyConfig
  action_reply_comment: ActionReplyCommentConfig
  trigger_new_comment: TriggerNewCommentConfig
  trigger_new_message: TriggerNewMessageConfig
}
function config<T extends keyof CampaignConfigs>(graph: WorkflowGraph, type: T): CampaignConfigs[T] {
  const node = graph.nodes.find(n => n.data.type === type)
  if (!node) throw new Error(`Missing campaign node: ${type}`)
  return node.data.config as CampaignConfigs[T]
}
const request = (value: unknown = input) => new NextRequest('https://example.test/api/automations', {
  method: 'POST', body: JSON.stringify({ follower_campaign: value }), headers: { 'Content-Type': 'application/json' },
})

beforeEach(() => {
  state.user = true; state.account = true; state.permission = true; state.insertError = false
  state.inserts = []; state.filters = []
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('paired follower campaign', () => {
  it('connects the confirmation button to only its matching follower-check campaign', () => {
    const first = buildFollowerCampaign(input, confirmation)
    const second = buildFollowerCampaign(input, '33333333-3333-4333-8333-333333333333')
    const button = config(first.entry.workflow_graph, 'action_private_reply')
    const trigger = config(first.verification.workflow_graph, 'trigger_new_message')
    expect(keywordMatch(button.confirm_payload ?? '', trigger.keywords, 'keywords')).toBe(true)
    expect(keywordMatch(button.confirm_payload ?? '', config(second.verification.workflow_graph, 'trigger_new_message').keywords, 'keywords')).toBe(false)
    expect(trigger.social_account_id).toBe(input.accountId)
    expect(trigger.recipient_cooldown_seconds).toBe(60)
    expect(button.follow_profile_url).toBe('https://www.instagram.com/example/')
    expect(config(first.entry.workflow_graph, 'trigger_new_comment')).toMatchObject({ post_scope: 'specific', post_id: input.postId, keywords: ['GUIDE'] })
    const check = first.verification.workflow_graph.nodes.find(n => n.data.type === 'action_condition')!
    expect(first.verification.workflow_graph.edges.filter(e => e.source === check.id).map(e => e.sourceHandle).sort()).toEqual(['false', 'true'])
    expect(first.entry.workflow_graph.nodes.some(n => n.data.type === 'action_ai_response')).toBe(false)
  })

  it('adds AI only when requested and supports every comment on the selected post', () => {
    const pair = buildFollowerCampaign({ ...input, useAiReply: true, allComments: true, keyword: '' }, confirmation)
    expect(config(pair.entry.workflow_graph, 'action_reply_comment').use_ai_response).toBe(true)
    expect(config(pair.entry.workflow_graph, 'action_ai_response').custom_instructions).toContain(input.publicReply)
    expect(config(pair.entry.workflow_graph, 'trigger_new_comment')).toMatchObject({ trigger_type: 'any', keywords: [] })
  })

  it.each([
    { resourceUrl: 'javascript:alert(1)' }, { profileUsername: 'example/path' }, { keyword: '' },
    { postId: 'not-a-post' }, { accountId: 'not-an-account' }, { buttonText: 'x'.repeat(21) },
  ])('rejects invalid campaign configuration %j', override => {
    expect(() => buildFollowerCampaign({ ...input, ...override }, confirmation)).toThrow('Invalid campaign')
  })

  it('creates both inactive drafts in a single database insert scoped to the active workspace', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(state.inserts).toHaveLength(1)
    expect(state.inserts[0]).toHaveLength(2)
    expect(state.inserts[0].every(row => row.workspace_id === 'workspace' && row.is_active === false)).toBe(true)
    expect(state.inserts[0][0].platform_post_id).toBe(input.postId)
    expect(state.inserts[0][1].platform_post_id).toBe('__canvas__')
    expect(state.filters).toContainEqual(['workspace_id', 'workspace'])
    expect((await response.json()).automations).toHaveLength(2)
  })

  it.each(['user', 'permission', 'account'] as const)('does not write without valid %s access', async key => {
    state[key] = false
    const response = await POST(request())
    expect(response.status).toBe(key === 'user' ? 401 : key === 'permission' ? 403 : 400)
    expect(state.inserts).toHaveLength(0)
  })

  it('returns a clear client error for malformed configuration', async () => {
    const response = await POST(request({ ...input, privateMessage: '' }))
    expect(response.status).toBe(400)
    expect(state.inserts).toHaveLength(0)
  })

  it('reports an atomic database failure without a second creation attempt', async () => {
    state.insertError = true
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(state.inserts).toHaveLength(1)
  })
})
