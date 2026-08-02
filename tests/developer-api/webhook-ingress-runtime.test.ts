import crypto from "node:crypto"

import { describe, expect, it } from "vitest"

import type {
  WebhookInboxEnqueueResult,
  WebhookInboxEvent,
  WebhookInboxStore,
} from "@/lib/webhooks/inbox-contract"
import {
  handleWebhookDelivery,
  handleWebhookIngressRequest,
  handleWebhookVerification,
  readBoundedRequestBody,
  resolveWebhookIngressConfig,
  verifyMetaWebhookSignature,
  verifyMetaWebhookToken,
  WebhookIngressBodyTooLargeError,
  type BoundedBodySource,
  type WebhookIngressConfig,
} from "@/lib/webhooks/ingress-runtime"

const APP_SECRET = "0123456789abcdef0123456789abcdef"
const VERIFY_TOKEN = "staging-verify-token"

function config(overrides: Partial<WebhookIngressConfig> = {}): WebhookIngressConfig {
  return {
    host: "127.0.0.1",
    port: 8080,
    deliveryPath: "/webhooks/meta",
    healthPath: "/healthz",
    maxBodyBytes: 1024,
    verifyToken: VERIFY_TOKEN,
    appSecrets: [APP_SECRET],
    ...overrides,
  }
}

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`
}

function commentDelivery(commentId = "comment-1"): string {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: "ig-account-1",
        time: 1_700_000_000,
        changes: [{ field: "comments", value: { id: commentId, text: "hello" } }],
      },
    ],
  })
}

function recordingStore(
  result: WebhookInboxEnqueueResult = { total: 1, inserted: 1, duplicates: 0 },
): WebhookInboxStore & { received: WebhookInboxEvent[][] } {
  const received: WebhookInboxEvent[][] = []
  return {
    received,
    async enqueue(events) {
      received.push(events)
      return result
    },
  }
}

function failingStore(): WebhookInboxStore {
  return {
    async enqueue() {
      throw new Error("permission denied for table webhook_inbox_events")
    },
  }
}

function bodySource(chunks: string[], headers: Record<string, string> = {}): BoundedBodySource {
  return {
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Buffer.from(chunk)
    },
  }
}

describe("resolveWebhookIngressConfig", () => {
  it("applies safe defaults", () => {
    const resolved = resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
    })

    expect(resolved).toMatchObject({
      host: "0.0.0.0",
      port: 8080,
      deliveryPath: "/webhooks/meta",
      healthPath: "/healthz",
      maxBodyBytes: 1024 * 1024,
      appSecrets: [APP_SECRET],
    })
  })

  it("fails closed without a verify token or app secret", () => {
    expect(() => resolveWebhookIngressConfig({ META_APP_SECRET: APP_SECRET }))
      .toThrow(/META_WEBHOOK_VERIFY_TOKEN is required/)
    expect(() => resolveWebhookIngressConfig({ META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN }))
      .toThrow(/INSTAGRAM_APP_SECRET or META_APP_SECRET is required/)
  })

  it("accepts both Meta secrets without duplicating an identical value", () => {
    const both = resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
      INSTAGRAM_APP_SECRET: "instagram-secret",
    })
    const identical = resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
      INSTAGRAM_APP_SECRET: APP_SECRET,
    })

    expect(both.appSecrets).toEqual(["instagram-secret", APP_SECRET])
    expect(identical.appSecrets).toEqual([APP_SECRET])
  })

  it("normalizes paths and rejects a collision", () => {
    const resolved = resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
      WEBHOOK_INGRESS_PATH: "ingress/meta/",
      WEBHOOK_INGRESS_HEALTH_PATH: "/health",
    })

    expect(resolved.deliveryPath).toBe("/ingress/meta")
    expect(resolved.healthPath).toBe("/health")
    expect(() => resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
      WEBHOOK_INGRESS_PATH: "/healthz",
    })).toThrow(/must differ/)
  })

  it("clamps the port and body cap to supported ranges", () => {
    const resolved = resolveWebhookIngressConfig({
      META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
      META_APP_SECRET: APP_SECRET,
      WEBHOOK_INGRESS_PORT: "999999",
      WEBHOOK_INGRESS_MAX_BODY_BYTES: "999999999",
    })

    expect(resolved.port).toBe(65_535)
    expect(resolved.maxBodyBytes).toBe(4 * 1024 * 1024)
  })
})

describe("verifyMetaWebhookSignature", () => {
  const body = Buffer.from(commentDelivery())

  it("accepts a signature from any configured secret", () => {
    expect(verifyMetaWebhookSignature([APP_SECRET], sign(body.toString()), body)).toBe(true)
    expect(verifyMetaWebhookSignature(
      ["other-secret", APP_SECRET],
      sign(body.toString()),
      body,
    )).toBe(true)
  })

  it("rejects missing, foreign, tampered, and truncated signatures", () => {
    expect(verifyMetaWebhookSignature([APP_SECRET], null, body)).toBe(false)
    expect(verifyMetaWebhookSignature([APP_SECRET], "   ", body)).toBe(false)
    expect(verifyMetaWebhookSignature([APP_SECRET], sign(body.toString(), "wrong"), body))
      .toBe(false)
    expect(verifyMetaWebhookSignature([APP_SECRET], `sha256=${"0".repeat(64)}`, body))
      .toBe(false)
    expect(verifyMetaWebhookSignature([APP_SECRET], "sha256=abc", body)).toBe(false)
  })

  it("rejects a signature computed over a different body", () => {
    expect(verifyMetaWebhookSignature([APP_SECRET], sign(commentDelivery("other")), body))
      .toBe(false)
  })
})

describe("verifyMetaWebhookToken", () => {
  it("only accepts the exact configured token", () => {
    expect(verifyMetaWebhookToken(VERIFY_TOKEN, VERIFY_TOKEN)).toBe(true)
    expect(verifyMetaWebhookToken(VERIFY_TOKEN, `${VERIFY_TOKEN} `)).toBe(false)
    expect(verifyMetaWebhookToken(VERIFY_TOKEN, null)).toBe(false)
    expect(verifyMetaWebhookToken(VERIFY_TOKEN, "")).toBe(false)
  })
})

describe("handleWebhookVerification", () => {
  it("echoes the challenge for a valid subscription handshake", () => {
    const response = handleWebhookVerification(config(), new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-value",
    }))

    expect(response.status).toBe(200)
    expect(response.body).toBe("challenge-value")
  })

  it("refuses a wrong token or mode without echoing anything", () => {
    const wrongToken = handleWebhookVerification(config(), new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "nope",
      "hub.challenge": "challenge-value",
    }))
    const wrongMode = handleWebhookVerification(config(), new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": VERIFY_TOKEN,
      "hub.challenge": "challenge-value",
    }))

    expect(wrongToken.status).toBe(403)
    expect(wrongToken.body).not.toContain("challenge-value")
    expect(wrongMode.status).toBe(403)
  })

  it("rejects a handshake without a challenge", () => {
    expect(handleWebhookVerification(config(), new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": VERIFY_TOKEN,
    })).status).toBe(400)
  })
})

describe("handleWebhookDelivery", () => {
  it("stores a verified delivery and reports the enqueue result", async () => {
    const store = recordingStore()
    const body = commentDelivery()

    const response = await handleWebhookDelivery(config(), store, {
      signature: sign(body),
      readBody: async () => Buffer.from(body),
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      received: true,
      total: 1,
      inserted: 1,
      duplicates: 0,
    })
    expect(store.received[0]).toHaveLength(1)
    expect(store.received[0]![0]).toMatchObject({
      provider: "meta",
      providerObject: "instagram",
      eventType: "comments",
      accountExternalId: "ig-account-1",
    })
  })

  it("never stores an unsigned or wrongly signed delivery", async () => {
    const store = recordingStore()
    const body = commentDelivery()

    const unsigned = await handleWebhookDelivery(config(), store, {
      signature: null,
      readBody: async () => Buffer.from(body),
    })
    const forged = await handleWebhookDelivery(config(), store, {
      signature: sign(body, "attacker-secret"),
      readBody: async () => Buffer.from(body),
    })

    expect(unsigned.status).toBe(401)
    expect(forged.status).toBe(401)
    expect(store.received).toHaveLength(0)
  })

  it("verifies the signature before parsing the body", async () => {
    const store = recordingStore()

    const response = await handleWebhookDelivery(config(), store, {
      signature: sign("not json"),
      readBody: async () => Buffer.from("not json"),
    })

    expect(response.status).toBe(400)
    expect(store.received).toHaveLength(0)
  })

  it("rejects a signed body that is not a JSON object", async () => {
    const body = JSON.stringify([{ object: "instagram" }])

    const response = await handleWebhookDelivery(config(), recordingStore(), {
      signature: sign(body),
      readBody: async () => Buffer.from(body),
    })

    expect(response.status).toBe(400)
    expect(response.reason).toBe("body_not_an_object")
  })

  it("reports an oversized payload without reading it into the response", async () => {
    const response = await handleWebhookDelivery(config(), recordingStore(), {
      signature: "sha256=irrelevant",
      readBody: async () => {
        throw new WebhookIngressBodyTooLargeError()
      },
    })

    expect(response.status).toBe(413)
    expect(response.reason).toBe("payload_too_large")
  })

  it("declines to acknowledge when the inbox write fails", async () => {
    const body = commentDelivery()

    const response = await handleWebhookDelivery(config(), failingStore(), {
      signature: sign(body),
      readBody: async () => Buffer.from(body),
    })

    // A 5xx keeps the delivery eligible for Meta's retry instead of losing it.
    expect(response.status).toBe(503)
    expect(response.body).not.toContain("permission denied")
  })

  it("acknowledges a signed delivery that carries no supported events", async () => {
    const store = recordingStore()
    const body = JSON.stringify({ object: "unsupported", entry: [] })

    const response = await handleWebhookDelivery(config(), store, {
      signature: sign(body),
      readBody: async () => Buffer.from(body),
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ total: 0, inserted: 0 })
    expect(store.received).toHaveLength(0)
  })
})

describe("handleWebhookIngressRequest", () => {
  const store = recordingStore()

  it("answers the health path without touching the inbox", async () => {
    const response = await handleWebhookIngressRequest(config(), store, {
      method: "GET",
      path: "/healthz",
      query: new URLSearchParams(),
      signature: null,
      readBody: async () => Buffer.alloc(0),
    })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: "ok" })
  })

  it("hides unknown paths and unsupported methods", async () => {
    const unknownPath = await handleWebhookIngressRequest(config(), store, {
      method: "POST",
      path: "/",
      query: new URLSearchParams(),
      signature: null,
      readBody: async () => Buffer.alloc(0),
    })
    const unsupportedMethod = await handleWebhookIngressRequest(config(), store, {
      method: "DELETE",
      path: "/webhooks/meta",
      query: new URLSearchParams(),
      signature: null,
      readBody: async () => Buffer.alloc(0),
    })

    expect(unknownPath.status).toBe(404)
    expect(unsupportedMethod.status).toBe(405)
  })
})

describe("readBoundedRequestBody", () => {
  it("returns a body inside the cap", async () => {
    const body = await readBoundedRequestBody(bodySource(["he", "llo"]), 16)
    expect(body.toString()).toBe("hello")
  })

  it("rejects an oversized declared length before reading", async () => {
    let read = false
    const source: BoundedBodySource = {
      headers: { "content-length": "999" },
      async *[Symbol.asyncIterator]() {
        read = true
        yield Buffer.from("x")
      },
    }

    await expect(readBoundedRequestBody(source, 16))
      .rejects.toBeInstanceOf(WebhookIngressBodyTooLargeError)
    expect(read).toBe(false)
  })

  it("rejects a stream that exceeds the cap despite a small declared length", async () => {
    const source = bodySource(["0123456789", "0123456789"], { "content-length": "4" })

    await expect(readBoundedRequestBody(source, 16))
      .rejects.toBeInstanceOf(WebhookIngressBodyTooLargeError)
  })
})
