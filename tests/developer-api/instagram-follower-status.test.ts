import { describe, expect, it, vi } from 'vitest'

import { checkInstagramFollowerStatus } from '@/supabase/functions/_shared/instagram-follower-status'

describe('Instagram follower status lookup', () => {
  it.each([
    [true, 'following'],
    [false, 'not following'],
  ])('returns %s when the provider reports the user is %s', async (follows) => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ is_user_follow_business: follows }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const signPayload = vi.fn(async (payload) => ({
      ...payload,
      appsecret_proof: 'signed-proof',
    }))

    await expect(
      checkInstagramFollowerStatus(
        {
          instagramScopedUserId: '123456789',
          accessToken: 'private-access-token',
          connectionMethod: 'instagram_login',
        },
        { fetchImpl, signPayload },
      ),
    ).resolves.toEqual({ ok: true, follows })

    const [url, init] = fetchImpl.mock.calls[0]
    const parsedUrl = new URL(url)
    expect(parsedUrl.pathname).toBe('/v25.0/123456789')
    expect(parsedUrl.searchParams.get('fields')).toBe(
      'is_user_follow_business',
    )
    expect(parsedUrl.searchParams.get('appsecret_proof')).toBe('signed-proof')
    expect(parsedUrl.searchParams.has('access_token')).toBe(false)
    expect(init?.headers).toEqual({
      Authorization: 'Bearer private-access-token',
    })
  })

  it('fails closed when no messaging-scoped sender ID is available', async () => {
    const fetchImpl = vi.fn()

    await expect(
      checkInstagramFollowerStatus(
        { accessToken: 'private-access-token' },
        { fetchImpl },
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: 'FOLLOWER_STATUS_CONTEXT_MISSING',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('returns a reconnect-safe error without exposing an invalid token', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { code: 190 } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    )

    const result = await checkInstagramFollowerStatus(
      {
        instagramScopedUserId: '123456789',
        accessToken: 'private-access-token',
      },
      {
        fetchImpl,
        signPayload: async (payload) => payload,
      },
    )

    expect(result).toMatchObject({
      ok: false,
      code: 'FOLLOWER_STATUS_TOKEN_INVALID',
    })
    expect(JSON.stringify(result)).not.toContain('private-access-token')
  })
})
