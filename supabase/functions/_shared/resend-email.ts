// @ts-nocheck - Shared Deno runtime helpers

export interface ResendSendEmailPayload {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  from?: string
  replyTo?: string | null
}

export interface ResendSendEmailResult {
  id?: string | null
  error?: string
  raw?: unknown
}

export function getAutomationEmailFrom(): string | null {
  return (
    Deno.env.get('AUTOMATION_EMAIL_FROM') ||
    Deno.env.get('INVITE_EMAIL_FROM') ||
    null
  )
}

export function getAutomationEmailReplyTo(): string | null {
  return (
    Deno.env.get('AUTOMATION_EMAIL_REPLY_TO') ||
    Deno.env.get('INVITE_EMAIL_REPLY_TO') ||
    null
  )
}

export function getAutomationFailureAlertRecipients(): string[] {
  const raw =
    Deno.env.get('AUTOMATION_FAILURE_ALERT_EMAILS') ||
    Deno.env.get('AUTOMATION_FAILURE_ALERT_EMAIL') ||
    ''

  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function textToSimpleHtml(text: string): string {
  const safe = escapeHtml(String(text || ''))
  return `<div style="font-family:Arial,sans-serif;white-space:pre-wrap;line-height:1.5;">${safe}</div>`
}

function normalizeToList(value: string | string[]): string[] {
  return Array.isArray(value)
    ? value.map((v) => String(v || '').trim()).filter(Boolean)
    : [String(value || '').trim()].filter(Boolean)
}

export async function sendResendEmail(payload: ResendSendEmailPayload): Promise<ResendSendEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    throw new Error('Missing RESEND_API_KEY')
  }

  const from = payload.from || getAutomationEmailFrom()
  if (!from) {
    throw new Error('Missing AUTOMATION_EMAIL_FROM (or INVITE_EMAIL_FROM) for automation emails')
  }

  const to = normalizeToList(payload.to)
  if (!to.length) {
    throw new Error('At least one recipient email is required')
  }

  const subject = String(payload.subject || '').trim()
  if (!subject) {
    throw new Error('Email subject is required')
  }

  const text = typeof payload.text === 'string' ? payload.text : undefined
  const html = typeof payload.html === 'string' ? payload.html : undefined
  if (!text && !html) {
    throw new Error('Email body is required')
  }

  const body: Record<string, unknown> = {
    from,
    to,
    subject,
  }

  if (text) body.text = text
  if (html) body.html = html
  const replyTo = payload.replyTo ?? getAutomationEmailReplyTo()
  if (replyTo) body.reply_to = replyTo

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await response.json().catch(() => ({}))
  if (!response.ok) {
    const msg =
      (typeof raw?.message === 'string' && raw.message) ||
      (typeof raw?.error === 'string' && raw.error) ||
      `HTTP ${response.status}`
    throw new Error(`Resend send failed: ${msg}`)
  }

  return {
    id: typeof raw?.id === 'string' ? raw.id : null,
    raw,
  }
}
