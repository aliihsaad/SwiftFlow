export type InstagramAutomationTriggerType = "trigger_new_message" | "trigger_story_reply"
export type InstagramAutomationEventType = "message" | "story_reply"

export interface InstagramAutomationAccountContext {
  account_id?: string
  metadata?: Record<string, unknown> | null
}

export interface InstagramAutomationEvent {
  triggerType: InstagramAutomationTriggerType
  eventType: InstagramAutomationEventType
  context: {
    sender_id: string
    sender_username?: string
    recipient_id?: string
    message_text: string
    message_id?: string
    message_has_attachments: boolean
    message_kind: "message" | "attachment" | "postback" | "story_reply"
    is_story_reply?: boolean
    story_id?: string
    story_url?: string
    timestamp: string
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value)
  }
  return undefined
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const text = stringValue(value)
    if (text) return text
  }
  return undefined
}

function normalizePayloadList(raw: unknown): Record<string, unknown>[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.map(asRecord).filter(Boolean) as Record<string, unknown>[]
  }

  const record = asRecord(raw)
  if (!record) return []

  if (Array.isArray(record.data)) {
    return record.data.map(asRecord).filter(Boolean) as Record<string, unknown>[]
  }

  const dataRecord = asRecord(record.data)
  if (dataRecord) return [dataRecord]

  return [record]
}

function normalizeTimestamp(raw: unknown, fallbackIso: string): string {
  const text = stringValue(raw)
  if (!text) return fallbackIso

  const numeric = Number(text)
  if (Number.isFinite(numeric) && numeric > 0) {
    const epochMs = numeric > 10_000_000_000 ? numeric : numeric * 1000
    return new Date(epochMs).toISOString()
  }

  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallbackIso
}

function extractStoryRecord(value: Record<string, unknown>, message: Record<string, unknown> | undefined) {
  const messageReplyTo = asRecord(message?.reply_to)
  const valueReplyTo = asRecord(value.reply_to)
  const custom = asRecord(message?.custom)
  const rawPayload = asRecord(custom?.rawPayload)
  const customReplyTo = asRecord(rawPayload?.reply_to)

  return (
    asRecord(messageReplyTo?.story) ||
    asRecord(valueReplyTo?.story) ||
    asRecord(customReplyTo?.story) ||
    asRecord(message?.story) ||
    asRecord(value.story)
  )
}

function buildSelfActorIds(account: InstagramAutomationAccountContext): Set<string> {
  const metadata = account.metadata || {}
  return new Set(
    [
      account.account_id,
      metadata.connected_page_id,
      metadata.page_id,
      metadata.instagram_business_account_id,
      metadata.ig_user_id,
    ]
      .map(stringValue)
      .filter(Boolean) as string[],
  )
}

export function buildInstagramMessagingAutomationEvents(
  value: Record<string, unknown>,
  account: InstagramAutomationAccountContext,
  options: { nowIso?: string } = {},
): InstagramAutomationEvent[] {
  const sender = asRecord(value.sender) || asRecord(value.from)
  const recipient = asRecord(value.recipient)
  const message = asRecord(value.message)
  const postback = asRecord(value.postback)
  const quickReply = asRecord(message?.quick_reply)
  const story = extractStoryRecord(value, message)

  const senderId = stringValue(sender?.id)
  if (!senderId) return []

  const selfActorIds = buildSelfActorIds(account)
  if (selfActorIds.has(senderId) || message?.is_echo === true) {
    return []
  }

  if (message?.is_deleted === true) {
    return []
  }

  const rawAttachments = message?.attachments || value.attachments
  const rawShares = message?.shares || message?.share || value.shares || value.share
  const attachments = normalizePayloadList(rawAttachments)
  const shares = normalizePayloadList(rawShares)
  const hasAttachmentPayload = attachments.length > 0 || shares.length > 0
  const postbackText = firstText(postback?.payload, postback?.title)
  const quickReplyText = firstText(quickReply?.payload, quickReply?.title)
  const stickerText = message?.sticker_id ? "[sticker]" : undefined
  const messageText = firstText(message?.text, value.text, quickReplyText, postbackText, stickerText) || ""
  const messageId = firstText(message?.mid, postback?.mid, value.id)

  if (message?.is_unsupported === true && !messageText && !hasAttachmentPayload && !story) {
    return []
  }

  if (!message && !postback && !messageText && !messageId && !hasAttachmentPayload && !story) {
    return []
  }

  const isStoryReply = !!story
  const timestamp = normalizeTimestamp(value.timestamp || message?.timestamp || value.created_time, options.nowIso || new Date().toISOString())
  const baseContext: InstagramAutomationEvent["context"] = {
    sender_id: senderId,
    sender_username: firstText(sender?.username, sender?.name),
    recipient_id: stringValue(recipient?.id),
    message_text: messageText,
    message_id: messageId,
    message_has_attachments: hasAttachmentPayload,
    message_kind: isStoryReply
      ? "story_reply"
      : (postback ? "postback" : (hasAttachmentPayload && !messageText ? "attachment" : "message")),
    timestamp,
  }

  if (isStoryReply) {
    baseContext.is_story_reply = true
    baseContext.story_id = stringValue(story.id)
    baseContext.story_url = stringValue(story.url)
  }

  const events: InstagramAutomationEvent[] = [
    {
      triggerType: "trigger_new_message",
      eventType: "message",
      context: baseContext,
    },
  ]

  if (isStoryReply) {
    events.push({
      triggerType: "trigger_story_reply",
      eventType: "story_reply",
      context: { ...baseContext },
    })
  }

  return events
}
