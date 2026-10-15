import { describe, expect, it, vi } from 'vitest'
import { buildInstagramPrivateReplyPlan } from '@/supabase/functions/_shared/instagram-private-reply'
import { deliverPrivateReply, privateReplyWindowOpen } from '@/supabase/functions/_shared/private-reply-delivery'

const scope = { workspaceId: 'workspace', socialAccountId: 'account', commentId: 'comment', source: 'manual' as const }
const textPlan = buildInstagramPrivateReplyPlan({}, 'Hello')
const buttonPlan = buildInstagramPrivateReplyPlan({ custom_button_enabled: true, button_title: 'Get guide', button_payload: 'SEND_GUIDE' }, 'Hello')
if (!textPlan.ok || !buttonPlan.ok) throw new Error('Invalid test fixture')
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

function database() {
  let state = ''
  return {
    state: () => state,
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_instagram_private_reply') {
        if (state && state !== 'failed') return { data: { claimed: false, status: state }, error: null }
        state = 'sending'
        return { data: { claimed: true, claimToken: 'claim' }, error: null }
      }
      state = String(args.p_status)
      return { data: true, error: null }
    }),
  }
}

describe('private reply eligibility and shared delivery', () => {
  it('uses the original comment time and excludes invalid, future and seven-day-old comments', () => {
    const now = Date.parse('2026-10-15T12:00:00Z')
    expect(privateReplyWindowOpen('2026-10-08T12:00:01Z', now)).toBe(true)
    expect(privateReplyWindowOpen('2026-10-08T12:00:00Z', now)).toBe(false)
    expect(privateReplyWindowOpen('2026-10-15T12:00:01Z', now)).toBe(false)
    expect(privateReplyWindowOpen('', now)).toBe(false)
  })

  it('makes a manual send and competing automation share one claim', async () => {
    const db = database()
    const send = vi.fn(async () => json({ message_id: 'message-1' }))
    const results = await Promise.all([
      deliverPrivateReply(db, scope, textPlan, send),
      deliverPrivateReply(db, { ...scope, source: 'automation' }, textPlan, send),
    ])
    expect(send).toHaveBeenCalledTimes(1)
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(db.state()).toBe('sent')
    expect((await deliverPrivateReply(db, scope, textPlan, send)).errorCode).toBe('private_reply_already_sent')
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('fails closed when reservation storage is unavailable', async () => {
    const send = vi.fn()
    const result = await deliverPrivateReply({ rpc: async () => ({ data: null, error: {} }) }, scope, textPlan, send)
    expect(result.errorCode).toBe('private_reply_unavailable')
    expect(send).not.toHaveBeenCalled()
  })

  it.each(['network', 'server', 'invalid-json', 'missing-message-id'] as const)('does not retry or text-fallback after an ambiguous %s response', async (failure) => {
    const db = database()
    const send = vi.fn(async () => {
      if (failure === 'network') throw new Error('timeout')
      if (failure === 'server') return json({ error: { code: 100 } }, 500)
      if (failure === 'invalid-json') return new Response('not json', { status: 200 })
      return json({})
    })
    const result = await deliverPrivateReply(db, scope, buttonPlan, send, true)
    expect(result.errorCode).toBe('private_reply_unknown')
    expect(db.state()).toBe('unknown')
    await deliverPrivateReply(db, scope, buttonPlan, send, true)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('allows correction after an explicit rejection without removing a successfully sent claim', async () => {
    const db = database()
    const send = vi.fn().mockResolvedValueOnce(json({ error: { code: 100 } }, 400))
      .mockResolvedValueOnce(json({ message_id: 'fixed' }))
    expect((await deliverPrivateReply(db, scope, buttonPlan, send)).deliveryStatus).toBe('failed')
    expect((await deliverPrivateReply(db, scope, textPlan, send)).success).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('keeps the existing automation text fallback only for explicit template rejection', async () => {
    const send = vi.fn().mockResolvedValueOnce(json({ error: { code: 100 } }, 400))
      .mockResolvedValueOnce(json({ message_id: 'fallback' }))
    const result = await deliverPrivateReply(database(), scope, buttonPlan, send, true)
    expect(result.output).toMatchObject({ deliveryMode: 'text_fallback', interactive: false })
    expect(send.mock.calls[1][0]).toEqual({ text: 'Hello\n\nReply with: SEND_GUIDE' })
  })

  it('remembers replies already sent outside SwiftFlow', async () => {
    const db = database()
    const send = vi.fn(async () => json({ error: { code: 100, error_subcode: 2534014 } }, 400))
    expect((await deliverPrivateReply(db, scope, textPlan, send)).errorCode).toBe('private_reply_already_sent')
    expect(db.state()).toBe('sent')
  })
})
