import { describe, expect, it } from "vitest"

import { assertAssistantEdgeFunctionName } from "@/lib/assistant/edge-invoke"

describe("assistant route helpers", () => {
  it("accepts allowed assistant edge functions", () => {
    expect(assertAssistantEdgeFunctionName("chat-assistant")).toBe("chat-assistant")
    expect(assertAssistantEdgeFunctionName("generate-image")).toBe("generate-image")
  })

  it("rejects unapproved assistant edge functions", () => {
    expect(() => assertAssistantEdgeFunctionName("sync-analytics")).toThrow('Function "sync-analytics" is not allowed')
    expect(() => assertAssistantEdgeFunctionName(null)).toThrow("functionName is required")
  })
})
