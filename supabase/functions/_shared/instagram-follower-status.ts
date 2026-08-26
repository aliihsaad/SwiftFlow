// @ts-nocheck - shared by Deno Edge Functions and Node-based tests
import {
  getMetaGraphApiBaseUrl,
  isSafeMetaGraphNodeId,
  metaGraphFetch,
  withMetaAppSecretProof,
} from './meta-graph.ts'

type FollowerStatusDependencies = {
  fetchImpl?: typeof metaGraphFetch
  signPayload?: typeof withMetaAppSecretProof
}

export type InstagramFollowerStatusResult =
  | { ok: true; follows: boolean }
  | { ok: false; code: string; error: string }

export async function checkInstagramFollowerStatus(
  input: {
    instagramScopedUserId?: unknown
    accessToken?: unknown
    connectionMethod?: unknown
  },
  dependencies: FollowerStatusDependencies = {},
): Promise<InstagramFollowerStatusResult> {
  const instagramScopedUserId = String(input.instagramScopedUserId || '').trim()
  const accessToken = String(input.accessToken || '').trim()

  if (!isSafeMetaGraphNodeId(instagramScopedUserId)) {
    return {
      ok: false,
      code: 'FOLLOWER_STATUS_CONTEXT_MISSING',
      error:
        'Follower status requires an Instagram user from a New Message or Story Reply trigger.',
    }
  }

  if (!accessToken) {
    return {
      ok: false,
      code: 'FOLLOWER_STATUS_ACCOUNT_DISCONNECTED',
      error: 'Instagram must be reconnected before follower status can be checked.',
    }
  }

  try {
    const signPayload = dependencies.signPayload || withMetaAppSecretProof
    const signedQuery = await signPayload(
      { fields: 'is_user_follow_business' },
      accessToken,
      { connectionMethod: input.connectionMethod },
    )
    const url = new URL(
      `${getMetaGraphApiBaseUrl(input.connectionMethod)}/${instagramScopedUserId}`,
    )

    for (const [key, value] of Object.entries(signedQuery)) {
      if (value != null) url.searchParams.set(key, String(value))
    }

    const fetchImpl = dependencies.fetchImpl || metaGraphFetch
    const response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const payload = await response.json().catch(() => null)

    if (!response.ok) {
      const providerCode = String(payload?.error?.code || '')
      return {
        ok: false,
        code:
          providerCode === '190'
            ? 'FOLLOWER_STATUS_TOKEN_INVALID'
            : 'FOLLOWER_STATUS_PROVIDER_ERROR',
        error:
          providerCode === '190'
            ? 'Instagram access expired. Reconnect Instagram and try again.'
            : 'Instagram follower status is temporarily unavailable.',
      }
    }

    if (typeof payload?.is_user_follow_business !== 'boolean') {
      return {
        ok: false,
        code: 'FOLLOWER_STATUS_NOT_RETURNED',
        error:
          'Instagram did not return follower status for this conversation.',
      }
    }

    return { ok: true, follows: payload.is_user_follow_business }
  } catch {
    return {
      ok: false,
      code: 'FOLLOWER_STATUS_PROVIDER_ERROR',
      error: 'Instagram follower status is temporarily unavailable.',
    }
  }
}
