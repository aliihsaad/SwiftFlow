import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/automations/post-thumbnail/route'
import { getInstagramThumbnailUrl } from '@/lib/instagram-thumbnail'

const accountId = '22222222-2222-4222-8222-222222222222'
const postId = '18145399315590026'
const state = vi.hoisted(() => ({
  user: true, permission: true, automation: true, account: true, mediaPermission: true,
  filters: [] as [string, string, unknown][],
}))
vi.mock('@/utils/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user ? { id: 'user' } : null } }) },
  from: (table: string) => {
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { state.filters.push([table, key, value]); return query },
      limit: () => query,
      maybeSingle: async () => ({ data: state.automation ? { id: 'automation' } : null }),
      single: async () => ({ data: state.account ? { access_token: 'test-token', metadata: {} } : null }),
    }
    return query
  },
}) }))
vi.mock('@/lib/workspace-utils', () => ({ getActiveWorkspace: async () => ({ id: 'workspace' }) }))
vi.mock('@/lib/workspace-permissions', () => ({
  requireWorkspacePermission: async () => { if (!state.permission) throw new Error('forbidden') },
  getWorkspacePermissionErrorStatus: (error: Error) => error.message === 'forbidden' ? 403 : null,
}))
vi.mock('@/lib/meta-account', () => ({
  decryptMetaAccountRow: (row: unknown) => row,
  canReadConnectedMediaWithMetaAccount: () => state.mediaPermission,
}))
const request = (account = accountId, post = postId) => new NextRequest(
  `https://example.test/api/automations/post-thumbnail?account_id=${encodeURIComponent(account)}&post_id=${encodeURIComponent(post)}`,
)
const freshUrl = 'https://scontent.cdninstagram.com/fresh-thumbnail.jpg?signature=new'

beforeEach(() => {
  state.user = true; state.permission = true; state.automation = true; state.account = true; state.mediaPermission = true
  state.filters = []
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: postId, media_type: 'VIDEO', thumbnail_url: freshUrl, media_url: 'https://scontent.cdninstagram.com/video.mp4' })))
})
afterEach(() => vi.unstubAllGlobals())

describe('saved automation thumbnail recovery', () => {
  it('fetches a fresh preview with workspace-scoped, read-only access and private caching', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ thumbnail_url: freshUrl })
    expect(response.headers.get('cache-control')).toBe('private, max-age=300')
    expect(response.headers.get('vary')).toBe('Cookie')
    expect(state.filters).toEqual(expect.arrayContaining([
      ['automations', 'workspace_id', 'workspace'], ['automations', 'social_account_id', accountId],
      ['automations', 'platform_post_id', postId], ['social_accounts', 'id', accountId],
      ['social_accounts', 'workspace_id', 'workspace'], ['social_accounts', 'platform', 'instagram'],
    ]))
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      `https://graph.instagram.com/v25.0/${postId}?fields=id%2Cmedia_type%2Cmedia_url%2Cthumbnail_url`,
      expect.objectContaining({ cache: 'no-store', headers: { Authorization: 'Bearer test-token' } }),
    )
  })

  it.each([
    ['user', 401], ['permission', 403], ['automation', 404], ['account', 404], ['mediaPermission', 403],
  ] as const)('does not contact Instagram without %s access', async (key, status) => {
    state[key] = false
    const response = await GET(request())
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([[accountId, '../me'], ['another-account', postId], [accountId, '__canvas__']])('rejects invalid identifiers', async (account, post) => {
    expect((await GET(request(account, post))).status).toBe(400)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does not leak provider errors or credentials into the response', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: { message: 'provider error with test-token' } }, { status: 400 }))
    const response = await GET(request())
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('test-token')
  })

  it('returns unavailable for deleted posts or missing reel thumbnails', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ media_type: 'VIDEO', media_url: 'https://scontent.cdninstagram.com/video.mp4' }))
    expect((await GET(request())).status).toBe(404)
  })

  it('uses image media URLs but never substitutes video files or unsafe hosts', () => {
    expect(getInstagramThumbnailUrl({ media_type: 'IMAGE', media_url: freshUrl })).toBe(freshUrl)
    expect(getInstagramThumbnailUrl({ media_type: 'VIDEO', media_url: freshUrl })).toBeNull()
    for (const url of ['https://cdninstagram.com.evil.test/a.jpg', 'http://scontent.cdninstagram.com/a.jpg', 'https://user:secret@scontent.cdninstagram.com/a.jpg', '/relative.jpg']) {
      expect(getInstagramThumbnailUrl({ thumbnail_url: url })).toBeNull()
    }
  })
})
