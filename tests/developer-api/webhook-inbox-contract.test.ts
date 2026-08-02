import { describe, expect, it } from "vitest"

import commentFixture from "@/tests/fixtures/webhooks/meta-instagram-comment.json"
import messagingFixture from "@/tests/fixtures/webhooks/meta-instagram-messaging-batch.json"
import {
  buildMetaWebhookInboxEvents,
  canTransitionWebhookInboxStatus,
  enqueueMetaWebhookDelivery,
  hashWebhookDelivery,
  type WebhookInboxEvent,
  type WebhookInboxStore,
} from "@/lib/webhooks/inbox-contract"

describe("Meta webhook inbox contract", () => {
  it("derives the same event identity for duplicate comment deliveries", () => {
    const rawBody = JSON.stringify(commentFixture)
    const first = buildMetaWebhookInboxEvents(commentFixture, hashWebhookDelivery(rawBody))
    const replay = buildMetaWebhookInboxEvents(
      structuredClone(commentFixture),
      hashWebhookDelivery(` ${rawBody}`),
    )

    expect(first).toHaveLength(1)
    expect(replay).toHaveLength(1)
    expect(first[0]?.providerEventKey).toBe(
      "instagram:17890000000000000:change:comments:comment-001",
    )
    expect(replay[0]?.providerEventKey).toBe(first[0]?.providerEventKey)
    expect(replay[0]?.deliveryHash).not.toBe(first[0]?.deliveryHash)
  })

  it("keeps an event identity stable when Meta rebatches the event", () => {
    const original = buildMetaWebhookInboxEvents(commentFixture)
    const rebatched = structuredClone(commentFixture)

    rebatched.entry[0]?.changes.push({
      field: "comments",
      value: {
        id: "comment-002",
        text: "Second comment",
        from: { id: "igsid-customer-002", username: "second" },
        media: { id: "media-001", media_product_type: "FEED" },
      },
    })

    const events = buildMetaWebhookInboxEvents(rebatched)

    expect(events).toHaveLength(2)
    expect(events[0]?.providerEventKey).toBe(original[0]?.providerEventKey)
    expect(new Set(events.map((event) => event.providerEventKey)).size).toBe(2)
  })

  it("uses message mids to split and deduplicate messaging batches", () => {
    const events = buildMetaWebhookInboxEvents(messagingFixture)

    expect(events.map((event) => event.providerEventKey)).toEqual([
      "instagram:17890000000000000:messaging:messaging:mid.message.001",
      "instagram:17890000000000000:messaging:messaging:mid.message.002",
    ])
    expect(events.every((event) => event.eventType === "messaging")).toBe(true)
  })

  it("uses a canonical hash when Meta supplies no stable event id", () => {
    const first = buildMetaWebhookInboxEvents({
      object: "instagram",
      entry: [{
        id: "account-1",
        time: 1785103200,
        changes: [{
          field: "mentions",
          value: { text: "hello", from: { username: "person", id: "user-1" } },
        }],
      }],
    })
    const reordered = buildMetaWebhookInboxEvents({
      entry: [{
        time: 1785109999,
        changes: [{
          value: { from: { id: "user-1", username: "person" }, text: "hello" },
          field: "mentions",
        }],
        id: "account-1",
      }],
      object: "instagram",
    })

    expect(first[0]?.providerEventKey).toMatch(/:hash_[0-9a-f]{64}$/)
    expect(reordered[0]?.providerEventKey).toBe(first[0]?.providerEventKey)
  })

  it("reports duplicate inserts through the provider-neutral store boundary", async () => {
    const seen = new Set<string>()
    const store: WebhookInboxStore = {
      async enqueue(events: WebhookInboxEvent[]) {
        let inserted = 0
        for (const event of events) {
          if (!seen.has(event.providerEventKey)) {
            seen.add(event.providerEventKey)
            inserted += 1
          }
        }
        return {
          total: events.length,
          inserted,
          duplicates: events.length - inserted,
        }
      },
    }
    const rawBody = JSON.stringify(commentFixture)

    await expect(enqueueMetaWebhookDelivery(store, commentFixture, rawBody))
      .resolves.toEqual({ total: 1, inserted: 1, duplicates: 0 })
    await expect(enqueueMetaWebhookDelivery(store, commentFixture, rawBody))
      .resolves.toEqual({ total: 1, inserted: 0, duplicates: 1 })
  })

  it("allows only recoverable worker state transitions", () => {
    expect(canTransitionWebhookInboxStatus("pending", "processing")).toBe(true)
    expect(canTransitionWebhookInboxStatus("processing", "retry_scheduled")).toBe(true)
    expect(canTransitionWebhookInboxStatus("retry_scheduled", "processing")).toBe(true)
    expect(canTransitionWebhookInboxStatus("processing", "succeeded")).toBe(true)
    expect(canTransitionWebhookInboxStatus("succeeded", "processing")).toBe(false)
    expect(canTransitionWebhookInboxStatus("dead_letter", "processing")).toBe(false)
  })
})
