import { describe, expect, it } from 'vitest'

import {
  buildInstagramPrivateReplyPlan,
  isInstagramProfileUrl,
} from '@/supabase/functions/_shared/instagram-private-reply'

describe('Instagram follower-gate private replies', () => {
  it('lets a custom button send an automation keyword independently of its label', () => {
    const plan = buildInstagramPrivateReplyPlan({ custom_button_enabled: true, button_title: 'Get my guide', button_payload: 'SEND_GUIDE' }, 'Here is your guide.')
    expect(plan.ok && plan.interactive && plan.message.attachment.payload.buttons).toEqual([
      { type: 'postback', title: 'Get my guide', payload: 'SEND_GUIDE' },
    ])
  })

  it.each([
    { button_title: '', button_payload: 'GUIDE' },
    { button_title: 'Guide', button_payload: '' },
    { button_title: 'x'.repeat(21), button_payload: 'GUIDE' },
    { button_title: 'Guide', button_payload: 'x'.repeat(129) },
  ])('rejects invalid button fields without truncating keywords', (config) => {
    expect(buildInstagramPrivateReplyPlan({ ...config, custom_button_enabled: true }, 'Hello').ok).toBe(false)
  })

  it('enforces the button template text limit', () => {
    expect(buildInstagramPrivateReplyPlan({ custom_button_enabled: true, button_title: 'Guide', button_payload: 'GUIDE' }, 'x'.repeat(641)).ok).toBe(false)
  })

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
