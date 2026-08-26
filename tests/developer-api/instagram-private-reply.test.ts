import { describe, expect, it } from 'vitest'

import {
  buildInstagramPrivateReplyPlan,
  isInstagramProfileUrl,
} from '@/supabase/functions/_shared/instagram-private-reply'

describe('Instagram follower-gate private replies', () => {
  it('keeps ordinary private replies as plain text', () => {
    expect(buildInstagramPrivateReplyPlan({}, 'Thanks for commenting.')).toEqual({
      ok: true,
      interactive: false,
      message: { text: 'Thanks for commenting.' },
      fallbackText: 'Thanks for commenting.',
    })
  })

  it('builds Follow and confirmation buttons with a stable postback payload', () => {
    const plan = buildInstagramPrivateReplyPlan({
      follower_gate_enabled: true,
      follow_profile_url: 'https://www.instagram.com/alidevlab/',
      follow_button_text: 'Follow @alidevlab',
      confirm_button_text: 'I Followed',
      confirm_payload: 'I FOLLOWED',
    }, 'Follow first, then confirm.')

    expect(plan.ok).toBe(true)
    if (!plan.ok || !plan.interactive) return

    expect(plan.message.attachment.payload.buttons).toEqual([
      {
        type: 'web_url',
        url: 'https://www.instagram.com/alidevlab/',
        title: 'Follow @alidevlab',
      },
      { type: 'postback', title: 'I Followed', payload: 'I FOLLOWED' },
    ])
    expect(plan.fallbackText).toContain('Then reply with: I FOLLOWED')
  })

  it('rejects non-Instagram and insecure profile URLs', () => {
    expect(isInstagramProfileUrl('https://example.com/alidevlab')).toBe(false)
    expect(isInstagramProfileUrl('http://instagram.com/alidevlab')).toBe(false)
    expect(buildInstagramPrivateReplyPlan({
      follower_gate_enabled: true,
      follow_profile_url: 'https://example.com/alidevlab',
      confirm_payload: 'I FOLLOWED',
    }, 'Follow first.')).toMatchObject({ ok: false })
  })
})
