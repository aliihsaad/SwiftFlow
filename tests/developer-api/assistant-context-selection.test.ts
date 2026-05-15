import { describe, expect, it } from "vitest"

import { contextKindsForIntent, summarizeAssistantContext } from "@/lib/assistant/context-selection"
import type { AssistantContextPack } from "@/lib/assistant/context-types"

describe("assistant context selection", () => {
  it("uses analytics context for analyze mode", () => {
    expect(contextKindsForIntent("analyze", "analyze_workspace")).toEqual(["brand", "accounts", "analytics", "content"])
  })

  it("uses automation context for automation inspection", () => {
    expect(contextKindsForIntent("operate", "inspect_automations")).toEqual(["brand", "accounts", "automations"])
  })

  it("uses post context for post inspection", () => {
    expect(contextKindsForIntent("operate", "inspect_posts")).toEqual(["brand", "accounts", "content"])
  })

  it("summarizes context receipts compactly", () => {
    const context: AssistantContextPack = {
      requestedKinds: ["brand", "accounts", "content"],
      brand: {
        businessName: "Aldievlab",
        industry: "AI SaaS",
        brandVoice: "professional",
        language: "en",
        targetAudience: "technical founders",
        businessDescription: "AI-first development studio",
        services: [],
        uniqueSellingPoints: [],
        contentThemes: [],
      },
      accounts: { connectedCount: 2, items: [] },
      content: {
        recentPosts: [{
          id: "p1",
          status: "draft",
          content: "Test",
          platforms: ["instagram"],
          mediaCount: 0,
          scheduledFor: null,
          publishedAt: null,
          updatedAt: null,
        }],
      },
      generatedAt: "2026-05-15T00:00:00.000Z",
      warnings: [],
    }

    expect(summarizeAssistantContext(context)).toMatchObject({
      label: "Used Aldievlab, 1 recent posts, 2 connected accounts",
      packs: ["brand", "accounts", "content"],
      warnings: [],
    })
  })
})
