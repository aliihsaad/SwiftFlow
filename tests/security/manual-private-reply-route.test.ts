import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), workspace: vi.fn(), permission: vi.fn(), account: vi.fn(), rpc: vi.fn(), rateLimit: vi.fn(),
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: mocks.user },
  from: (table: string) => {
    expect(table).toBe('social_accounts')
    const query = { select: vi.fn(() => query), eq: vi.fn(() => query), single: mocks.account }
    return query
  },
}) }))
vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/workspace-utils', () => ({ getExplicitActiveWorkspace: mocks.workspace }))
vi.mock('@/lib/workspace-permissions', () => ({
  requireWorkspacePermission: mocks.permission,
  getWorkspacePermissionErrorStatus: (error: Error) => error.message === 'Forbidden' ? 403 : null,
}))
vi.mock('@/lib/meta-account', () => ({
  decryptMetaAccountRow: (row: unknown) => row,
  canManageCommentsWithMetaAccount: () => true,
}))
vi.mock('@/lib/security/rate-limit', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/security/rate-limit')>(), enforceRateLimit: mocks.rateLimit,
}))

import { POST } from '@/app/api/posts-media/comments/private-reply/route'

const request = (overrides = {}) => new NextRequest('http://localhost/api/posts-media/comments/private-reply', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ workspaceId: 'workspace-a', postId: '123456', commentId: '456789', message: 'Here is the guide.', ...overrides }),
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let providerFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.user.mockResolvedValue({ data: { user: { id: 'editor' } } })
  mocks.workspace.mockResolvedValue({ id: 'workspace-a' })
  mocks.permission.mockResolvedValue('editor')
  mocks.rateLimit.mockResolvedValue(undefined)
  mocks.account.mockResolvedValue({ data: { id: 'account-a', account_id: '789123', access_token: 'test-token', metadata: {} }, error: null })
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name.startsWith('claim_')
    ? { claimed: true, claimToken: 'claim-a' } : true, error: null }))
  providerFetch = vi.fn()
    .mockResolvedValueOnce(json({ id: '456789', media: { id: '123456' }, timestamp: new Date().toISOString() }))
    .mockResolvedValueOnce(json({ id: '123456', owner: { id: '789123' } }))
    .mockResolvedValueOnce(json({ message_id: 'sent-message' }))
  vi.stubGlobal('fetch', providerFetch)
})
afterEach(() => vi.unstubAllGlobals())

describe('manual comment private reply route', () => {
  it('sends a comment-addressed private reply with the custom label and exact keyword', async () => {
    const response = await POST(request({ button: { title: 'Get my guide', keyword: 'SEND_GUIDE' } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, deliveryStatus: 'sent' })
    expect(mocks.permission).toHaveBeenCalledWith(expect.anything(), 'editor', 'workspace-a', 'content:write')
    expect(mocks.rpc.mock.calls[0]).toEqual(['claim_instagram_private_reply', {
      p_workspace_id: 'workspace-a', p_social_account_id: 'account-a', p_comment_id: '456789', p_source: 'manual',
    }])
    const [url, init] = providerFetch.mock.calls[2]
    expect(url).toBe('https://graph.instagram.com/v25.0/789123/messages')
    expect(JSON.parse(init.body)).toMatchObject({ recipient: { comment_id: '456789' }, message: {
      attachment: { payload: { text: 'Here is the guide.', buttons: [{ type: 'postback', title: 'Get my guide', payload: 'SEND_GUIDE' }] } },
    } })
  })

  it('rejects unauthenticated and read-only users before any provider call', async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request())).status).toBe(401)
    mocks.permission.mockRejectedValueOnce(new Error('Forbidden'))
    expect((await POST(request())).status).toBe(403)
    expect(providerFetch).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects a composer opened in a different workspace', async () => {
    expect((await POST(request({ workspaceId: 'workspace-b' }))).status).toBe(409)
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it.each([null, [], 'invalid'])('rejects a non-object JSON body', async (body) => {
    const response = await POST(new NextRequest('http://localhost/api/posts-media/comments/private-reply', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }))
    expect(response.status).toBe(400)
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it.each([
    { commentId: '../messages' }, { postId: 'invalid' }, { message: ' ' },
    { message: 'x'.repeat(1001) }, { button: { title: 'Get guide', keyword: '' } },
  ])('rejects malformed input before accessing Meta', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(providerFetch).not.toHaveBeenCalled()
  })

  it('checks the comment belongs to the selected post', async () => {
    providerFetch.mockReset().mockResolvedValueOnce(json({ id: '456789', media: { id: '999999' } }))
    expect((await POST(request())).status).toBe(403)
    expect(providerFetch).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('checks media ownership even when the token can read the media', async () => {
    providerFetch.mockReset()
      .mockResolvedValueOnce(json({ id: '456789', media: { id: '123456' }, timestamp: new Date().toISOString() }))
      .mockResolvedValueOnce(json({ id: '123456', owner: { id: '999999' } }))
      .mockResolvedValueOnce(json({ id: '789123', user_id: '888888' }))
    expect((await POST(request())).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('accepts the verified app-scoped owner alias returned by Instagram Login', async () => {
    providerFetch.mockReset()
      .mockResolvedValueOnce(json({ id: '456789', media: { id: '123456' }, timestamp: new Date().toISOString() }))
      .mockResolvedValueOnce(json({ id: '123456', owner: { id: '999999' } }))
      .mockResolvedValueOnce(json({ id: '999999', user_id: '789123' }))
      .mockResolvedValueOnce(json({ message_id: 'sent-message' }))
    expect((await POST(request())).status).toBe(200)
    expect(providerFetch.mock.calls[2][0]).toContain('/me?fields=id%2Cuser_id')
  })

  it('rejects a token identity that does not match the connected account', async () => {
    providerFetch.mockReset()
      .mockResolvedValueOnce(json({ id: '456789', media: { id: '123456' }, timestamp: new Date().toISOString() }))
      .mockResolvedValueOnce(json({ id: '123456', owner: { id: '999999' } }))
      .mockResolvedValueOnce(json({ id: '999999', user_id: '888888' }))
    expect((await POST(request())).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('uses Meta timestamps rather than a forged fresh timestamp from the browser', async () => {
    providerFetch.mockReset()
      .mockResolvedValueOnce(json({ id: '456789', media: { id: '123456' }, timestamp: new Date(Date.now() - 8 * 86400_000).toISOString() }))
      .mockResolvedValueOnce(json({ id: '123456', owner: { id: '789123' } }))
    const response = await POST(request({ timestamp: new Date().toISOString() }))
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ errorCode: 'private_reply_expired' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not send when a prior manual or automation claim already exists', async () => {
    mocks.rpc.mockResolvedValue({ data: { claimed: false, status: 'sent' }, error: null })
    const response = await POST(request())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ errorCode: 'private_reply_already_sent' })
    expect(providerFetch).toHaveBeenCalledTimes(2)
  })
})
