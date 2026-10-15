// @ts-nocheck - shared by Deno Edge Functions and Node-based tests

export type InstagramPrivateReplyPlan =
  | {
      ok: true
      interactive: false
      message: { text: string }
      fallbackText: string
    }
  | {
      ok: true
      interactive: true
      message: {
        attachment: {
          type: 'template'
          payload: {
            template_type: 'button'
            text: string
            buttons: Array<Record<string, string>>
          }
        }
      }
      fallbackText: string
      confirmationPayload: string
    }
  | { ok: false; error: string }

function cleanText(value: unknown, maxLength: number): string {
  return String(value || '').trim().slice(0, maxLength)
}

export function isInstagramProfileUrl(value: unknown): boolean {
  try {
    const url = new URL(String(value || '').trim())
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com'))
    )
  } catch {
    return false
  }
}

export function buildInstagramPrivateReplyPlan(
  config: Record<string, unknown>,
  messageValue: unknown,
): InstagramPrivateReplyPlan {
  const message = String(messageValue || '').trim()
  if (!message) return { ok: false, error: 'Private Reply message cannot be empty' }

  // Manual replies can carry one custom postback into a New Message journey.
  // Reject overlong values rather than silently changing a trigger keyword.
  if (config.custom_button_enabled === true) {
    const title = typeof config.button_title === 'string' ? config.button_title.trim() : ''
    const payload = typeof config.button_payload === 'string' ? config.button_payload.trim() : ''
    if (!title || title.length > 20) {
      return { ok: false, error: 'Button text must be between 1 and 20 characters.' }
    }
    if (!payload || payload.length > 128) {
      return { ok: false, error: 'Automation keyword must be between 1 and 128 characters.' }
    }
    if (message.length > 640) {
      return { ok: false, error: 'Messages with a button must be 640 characters or fewer.' }
    }
    return {
      ok: true,
      interactive: true,
      message: { attachment: { type: 'template', payload: {
        template_type: 'button', text: message,
        buttons: [{ type: 'postback', title, payload }],
      } } },
      fallbackText: `${message}\n\nReply with: ${payload}`,
      confirmationPayload: payload,
    }
  }

  if (config.follower_gate_enabled !== true) {
    return { ok: true, interactive: false, message: { text: message }, fallbackText: message }
  }

  const profileUrl = cleanText(config.follow_profile_url, 500)
  const followButtonText = cleanText(config.follow_button_text, 20) || 'Follow account'
  const confirmButtonText = cleanText(config.confirm_button_text, 20) || 'I Followed'
  const confirmationPayload = cleanText(config.confirm_payload, 128)

  if (!isInstagramProfileUrl(profileUrl)) {
    return {
      ok: false,
      error: 'Follower gate requires a valid HTTPS Instagram profile URL.',
    }
  }
  if (!confirmationPayload) {
    return { ok: false, error: 'Follower gate requires a confirmation payload.' }
  }

  return {
    ok: true,
    interactive: true,
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: message,
          buttons: [
            { type: 'web_url', url: profileUrl, title: followButtonText },
            { type: 'postback', title: confirmButtonText, payload: confirmationPayload },
          ],
        },
      },
    },
    fallbackText: `${message}\n\nFollow here: ${profileUrl}\nThen reply with: ${confirmationPayload}`,
    confirmationPayload,
  }
}
