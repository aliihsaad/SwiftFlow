import { normalizeMetaMessagingError, type MetaMessagingError } from './meta-messaging-error.ts'
import type { InstagramPrivateReplyPlan } from './instagram-private-reply.ts'

export interface PrivateReplyScope {
  workspaceId: string
  socialAccountId: string
  commentId: string
  source: 'manual' | 'automation'
}

interface DeliveryDatabase {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

export type PrivateReplyDeliveryStatus = 'sending' | 'sent' | 'failed' | 'unknown'

export const PRIVATE_REPLY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function privateReplyWindowOpen(timestamp: string, now = Date.now()): boolean {
  const created = Date.parse(timestamp)
  return Number.isFinite(created) && created <= now && now - created < PRIVATE_REPLY_WINDOW_MS
}

export interface PrivateReplyDeliveryResult {
  success: boolean
  dmSent?: boolean
  error?: string
  errorCode?: string
  deliveryStatus?: PrivateReplyDeliveryStatus
  output?: {
    meta_error?: MetaMessagingError
    channel: 'private_reply'
    messageId?: string
    deliveryMode: string
    interactive: boolean
    trackingSaved?: boolean
  }
}

/** Shared by the Next.js manual endpoint and both managed automation paths. */
export async function deliverPrivateReply(
  database: DeliveryDatabase,
  scope: PrivateReplyScope,
  plan: Extract<InstagramPrivateReplyPlan, { ok: true }>,
  send: (message: Record<string, unknown>) => Promise<Response>,
  allowTextFallback = false,
): Promise<PrivateReplyDeliveryResult> {
  const args = {
    p_workspace_id: scope.workspaceId,
    p_social_account_id: scope.socialAccountId,
    p_comment_id: scope.commentId,
  }
  let claim: { claimed?: boolean; claimToken?: string; status?: PrivateReplyDeliveryStatus }
  try {
    const result = await database.rpc('claim_instagram_private_reply', { ...args, p_source: scope.source })
    if (result.error || !result.data) throw new Error('Claim unavailable')
    claim = result.data as typeof claim
  } catch {
    return { success: false, errorCode: 'private_reply_unavailable', error: 'Private messaging is temporarily unavailable. Please try again later.' }
  }
  if (!claim.claimed || !claim.claimToken) {
    return {
      success: false, deliveryStatus: claim.status,
      errorCode: claim.status === 'sent' ? 'private_reply_already_sent' : 'private_reply_unknown',
      error: claim.status === 'sent'
        ? 'This comment has already received a private message.'
        : 'A message is being sent or its delivery could not be confirmed. Check Instagram before taking further action.',
    }
  }
  const finish = async (status: PrivateReplyDeliveryStatus, messageId: string | null = null) => {
    try {
      const result = await database.rpc('finish_instagram_private_reply', {
        ...args, p_claim_token: claim.claimToken, p_status: status, p_message_id: messageId,
      })
      return !result.error && result.data === true
    } catch { return false }
  }
  let deliveryMode = plan.interactive ? 'buttons' : 'text'
  try {
    let response = await send(plan.message)
    let body = await response.json().catch(() => null)
    // Only an explicit invalid-template rejection can safely fall back. Never
    // resend after a timeout, missing response, 5xx, or uncertain acceptance.
    if (plan.interactive && allowTextFallback && response.status === 400 && body?.error?.code === 100
      && normalizeMetaMessagingError(body.error, response.status).outcome !== 'recipient_restricted') {
      deliveryMode = 'text_fallback'
      response = await send({ text: plan.fallbackText })
      body = await response.json().catch(() => null)
    }
    if (response.ok && !body?.error && typeof body?.message_id === 'string' && body.message_id) {
      const trackingSaved = await finish('sent', body.message_id)
      return { success: true, dmSent: true, deliveryStatus: 'sent', output: {
        channel: 'private_reply', messageId: body.message_id, deliveryMode,
        interactive: deliveryMode === 'buttons', trackingSaved,
      } }
    }
    const providerError = body?.error
    if (providerError && response.status >= 400 && response.status < 500) {
      // 2534014 has been observed with "Cannot find the requested user.";
      // the subcode alone is not evidence that any message was delivered.
      const alreadySent = /already.*(private|repl)|private.*already/i.test(String(providerError.message || ''))
      const status = alreadySent ? 'sent' : 'failed'
      const saved = await finish(status)
      if (!saved) throw new Error('Delivery state unavailable')
      return {
        success: false, deliveryStatus: status,
        output: { channel: 'private_reply', deliveryMode, interactive: deliveryMode === 'buttons', meta_error: normalizeMetaMessagingError(providerError, response.status) },
        errorCode: alreadySent ? 'private_reply_already_sent' : 'private_reply_rejected',
        error: alreadySent ? 'This comment has already received a private message.'
          : Number(providerError.code) === 190
            ? 'Reconnect Instagram in Settings before sending this message.'
            : 'Instagram could not send this private message. Check account permissions and whether the comment is still eligible.',
      }
    }
  } catch {
    // The request may have reached Meta. Leave a durable block on another send.
  }
  await finish('unknown')
  return { success: false, deliveryStatus: 'unknown', errorCode: 'private_reply_unknown',
    error: 'Delivery could not be confirmed. Check Instagram; this comment is locked to prevent a duplicate message.' }
}
