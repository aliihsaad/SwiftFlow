import { describe, expect, it } from "vitest"

import { buildInstagramMessagingAutomationEvents } from "@/lib/webhooks/instagram-automation-events"

const account = {
  account_id: "17890000000000000",
  metadata: {
    connected_page_id: "1122334455667788",
    page_id: "1122334455667788",
  },
}

describe("buildInstagramMessagingAutomationEvents", () => {
  it("routes story replies from messaging payloads to both DM and story reply triggers", () => {
    const events = buildInstagramMessagingAutomationEvents({
      sender: { id: "igsid-user-1", username: "builder" },
      recipient: { id: "17890000000000000" },
      timestamp: 1778751000000,
      message: {
        mid: "mid.story.reply.1",
        text: "Great story",
        reply_to: {
          story: {
            id: "story-123",
            url: "https://lookaside.fbsbx.com/ig_messaging_cdn/story",
          },
        },
      },
    }, account)

    expect(events.map((event) => event.triggerType)).toEqual([
      "trigger_new_message",
      "trigger_story_reply",
    ])
    expect(events[0]?.context).toMatchObject({
      sender_id: "igsid-user-1",
      sender_username: "builder",
      message_id: "mid.story.reply.1",
      message_text: "Great story",
      is_story_reply: true,
      story_id: "story-123",
      story_url: "https://lookaside.fbsbx.com/ig_messaging_cdn/story",
    })
    expect(events[1]?.context).toMatchObject({
      sender_id: "igsid-user-1",
      message_text: "Great story",
      story_id: "story-123",
      story_url: "https://lookaside.fbsbx.com/ig_messaging_cdn/story",
    })
  })

  it("keeps attachment-only inbound DMs eligible for any-message automations", () => {
    const events = buildInstagramMessagingAutomationEvents({
      sender: { id: "igsid-user-2" },
      recipient: { id: "17890000000000000" },
      timestamp: 1778751000000,
      message: {
        mid: "mid.attachment.1",
        attachments: [{ type: "image", payload: { url: "https://cdn.example/image.jpg" } }],
      },
    }, account)

    expect(events).toHaveLength(1)
    expect(events[0]?.triggerType).toBe("trigger_new_message")
    expect(events[0]?.context).toMatchObject({
      sender_id: "igsid-user-2",
      message_id: "mid.attachment.1",
      message_text: "",
      message_has_attachments: true,
    })
  })

  it("uses quick reply or postback payload text when Meta omits message text", () => {
    const quickReplyEvents = buildInstagramMessagingAutomationEvents({
      sender: { id: "igsid-user-3" },
      recipient: { id: "17890000000000000" },
      timestamp: 1778751000000,
      message: {
        mid: "mid.quick.1",
        quick_reply: { payload: "BOOK_DEMO" },
      },
    }, account)

    const postbackEvents = buildInstagramMessagingAutomationEvents({
      sender: { id: "igsid-user-4" },
      recipient: { id: "17890000000000000" },
      timestamp: 1778751000000,
      postback: {
        mid: "mid.postback.1",
        payload: "START_FLOW",
      },
    }, account)

    expect(quickReplyEvents[0]?.context.message_text).toBe("BOOK_DEMO")
    expect(postbackEvents[0]?.context.message_text).toBe("START_FLOW")
  })

  it("ignores self-authored echoes so DM automations do not reply to themselves", () => {
    const events = buildInstagramMessagingAutomationEvents({
      sender: { id: "1122334455667788" },
      recipient: { id: "igsid-user-5" },
      timestamp: 1778751000000,
      message: {
        mid: "mid.echo.1",
        text: "Our outbound message",
        is_echo: true,
      },
    }, account)

    expect(events).toEqual([])
  })
})
