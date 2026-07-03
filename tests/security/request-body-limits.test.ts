import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { readRawBodyWithLimit, RequestBodyTooLargeError } from "@/lib/security/phase1-validation"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function postRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/webhooks/instagram", {
    method: "POST",
    body,
    ...( { duplex: "half" } as RequestInit),
  })
}

describe("readRawBodyWithLimit", () => {
  it("returns the full body when under the cap", async () => {
    const bytes = await readRawBodyWithLimit(postRequest("hello world"), 1024)
    expect(new TextDecoder().decode(bytes)).toBe("hello world")
  })

  it("rejects a body larger than the cap", async () => {
    await expect(readRawBodyWithLimit(postRequest("x".repeat(2048)), 1024))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError)
  })

  it("rejects an oversized streamed body without trusting content-length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const chunk = new Uint8Array(512)
        for (let i = 0; i < 8; i++) controller.enqueue(chunk)
        controller.close()
      },
    })

    await expect(readRawBodyWithLimit(postRequest(stream), 1024))
      .rejects.toBeInstanceOf(RequestBodyTooLargeError)
  })
})

describe("instagram webhook body cap", () => {
  it("bounds the raw body before signature verification", () => {
    const route = source("app", "api", "webhooks", "instagram", "route.ts")

    expect(route).toContain("readRawBodyWithLimit(")
    expect(route).toContain("RequestBodyTooLargeError")
    expect(route).toContain("status: 413")
    expect(route).not.toContain("request.arrayBuffer()")
    expect(route.indexOf("readRawBodyWithLimit(")).toBeLessThan(route.indexOf("timingSafeEqual"))
  })
})

describe("message send routes", () => {
  it("caps bodies, rate limits, and shares the Meta send helper", () => {
    for (const route of [
      source("app", "api", "messages", "route.ts"),
      source("app", "api", "live-messages", "send", "route.ts"),
    ]) {
      expect(route).toContain("assertJsonBodySize(request")
      expect(route).toContain("MAX_OUTBOUND_MESSAGE_LENGTH")
      expect(route).toContain("sendMetaTextMessage(")
      expect(route).toContain("enforceRateLimit(")
      expect(route).toContain("'messages:send:user'")
      expect(route).toContain("'messages:send:ip'")
      expect(route).toContain("status: 429")
      expect(route).toContain("Retry-After")
      expect(route).toContain("redactSensitiveLogValue(error)")
      expect(route).toContain("getExplicitActiveWorkspace()")
    }
  })
})
