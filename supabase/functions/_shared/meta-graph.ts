// @ts-nocheck - Deno runtime helper

export const META_GRAPH_API_VERSION = "v21.0"
export const META_GRAPH_API_BASE_URL = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`

const META_GRAPH_NODE_ID_RE = /^[0-9_]{3,128}$/

export function isSafeMetaGraphNodeId(value: unknown): value is string {
  return typeof value === 'string' && META_GRAPH_NODE_ID_RE.test(value.trim())
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function createMetaAppSecretProof(accessToken: string, appSecret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(accessToken))
  return bytesToHex(signature)
}

export async function withMetaAppSecretProof<T extends Record<string, unknown>>(
  payload: T,
  accessToken: string,
): Promise<T & { appsecret_proof?: string }> {
  const appSecret = Deno.env.get('META_APP_SECRET')?.trim()
  if (!appSecret || !accessToken) return payload

  return {
    ...payload,
    appsecret_proof: await createMetaAppSecretProof(accessToken, appSecret),
  }
}

export async function toMetaGraphFormBody(
  payload: Record<string, unknown>,
  accessToken: string,
): Promise<URLSearchParams> {
  const signedPayload = await withMetaAppSecretProof(payload, accessToken)
  const body = new URLSearchParams()

  for (const [key, value] of Object.entries(signedPayload)) {
    if (value == null) continue
    body.set(key, typeof value === 'string' ? value : JSON.stringify(value))
  }

  return body
}
