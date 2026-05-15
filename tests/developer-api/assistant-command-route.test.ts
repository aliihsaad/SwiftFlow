import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"

const state = vi.hoisted(() => ({
  edgeBody: null as null | Record<string, unknown>,
  contextAction: "",
}))

vi.mock("@/lib/assistant/auth", () => ({
  AssistantAuthError: class AssistantAuthError extends Error {
    constructor(message: string, public status: number) {
      super(message)
    }
  },
  resolveAssistantWorkspace: vi.fn(async () => ({ userId: "user-1", workspaceId })),
}))

vi.mock("@/lib/security/rate-limit", () => ({
  RateLimitExceededError: class RateLimitExceededError extends Error {
    retryAfterSeconds = 30
  },
  enforceRateLimit: vi.fn(async () => undefined),
  getClientIp: vi.fn(() => "127.0.0.1"),
}))

vi.mock("@/lib/assistant/context-packs", () => ({
  buildAssistantContext: vi.fn(async ({ action }: { action: string }) => {
    state.contextAction = action
    return {
      requestedKinds: action === "analyze_workspace" ? ["brand", "accounts", "analytics", "content"] : ["brand", "accounts", "content"],
      brand: {
        businessName: "Aldievlab",
        industry: "AI SaaS",
        brandVoice: "professional",
        language: "en",
        targetAudience: "",
        businessDescription: "",
        services: [],
        uniqueSellingPoints: [],
        contentThemes: [],
      },
      accounts: { connectedCount: 1, items: [] },
      generatedAt: "2026-05-15T00:00:00.000Z",
      warnings: [],
    }
  }),
}))

vi.mock("@/lib/assistant/edge-invoke", () => ({
  invokeAssistantEdgeFunction: vi.fn(async (_functionName: string, body: Record<string, unknown>) => {
    state.edgeBody = body
    return { ok: true, status: 200, payload: { response: "Context-aware answer" } }
  }),
}))

import * as commandRoute from "@/app/api/assistant/command/route"

describe("assistant command route", () => {
  beforeEach(() => {
    state.edgeBody = null
    state.contextAction = ""
  })

  it("builds analytics context and passes it to chat-assistant", async () => {
    const request = new NextRequest("https://social.swiftdigital-s.com/api/assistant/command", {
      method: "POST",
      body: JSON.stringify({
        message: "Analyze my best posts this month",
        messages: [{ role: "user", content: "Analyze my best posts this month" }],
        mode: "analyze",
        functionName: "chat-assistant",
      }),
    })

    const response = await commandRoute.POST(request)
    expect(response.status).toBe(200)
    expect(state.contextAction).toBe("analyze_workspace")
    expect(state.edgeBody?.assistantContext).toBeTruthy()
    await expect(response.json()).resolves.toMatchObject({
      data: { response: "Context-aware answer" },
      assistantIntent: { mode: "analyze", action: "analyze_workspace" },
      contextReceipt: { packs: ["brand", "accounts", "analytics", "content"] },
    })
  })

  it("rejects specialized function calls in command route", async () => {
    const request = new NextRequest("https://social.swiftdigital-s.com/api/assistant/command", {
      method: "POST",
      body: JSON.stringify({
        message: "Create an image",
        messages: [{ role: "user", content: "Create an image" }],
        mode: "create",
        functionName: "generate-image",
      }),
    })

    const response = await commandRoute.POST(request)
    expect(response.status).toBe(400)
  })
})
