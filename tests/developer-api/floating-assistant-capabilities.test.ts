import { describe, expect, it } from "vitest"

import {
  assertAssistantSurfaceCapability,
  normalizeAssistantSurface,
} from "@/lib/assistant/capabilities"
import { shouldHideFloatingAssistant } from "@/lib/assistant/floating-visibility"

describe("floating assistant capability policy", () => {
  it("normalizes floating surface aliases", () => {
    expect(normalizeAssistantSurface("floating")).toBe("floating_readonly")
    expect(normalizeAssistantSurface("floating_readonly")).toBe("floating_readonly")
    expect(normalizeAssistantSurface("full")).toBe("full")
    expect(normalizeAssistantSurface(undefined)).toBe("full")
  })

  it("allows read-only floating assistant chat actions", () => {
    expect(() => assertAssistantSurfaceCapability({
      surface: "floating_readonly",
      mode: "analyze",
      action: "analyze_workspace",
      functionName: "chat-assistant",
    })).not.toThrow()

    expect(() => assertAssistantSurfaceCapability({
      surface: "floating_readonly",
      mode: "operate",
      action: "inspect_automations",
      functionName: "chat-assistant",
    })).not.toThrow()
  })

  it("blocks generation and improvement actions on the floating surface", () => {
    expect(() => assertAssistantSurfaceCapability({
      surface: "floating_readonly",
      mode: "create",
      action: "generate_image",
      functionName: "generate-image",
    })).toThrow("Floating assistant")

    expect(() => assertAssistantSurfaceCapability({
      surface: "floating_readonly",
      mode: "improve",
      action: "improve_text",
      functionName: "chat-assistant",
    })).toThrow("Floating assistant")
  })

  it("hides the widget on the full assistant page", () => {
    expect(shouldHideFloatingAssistant("/dashboard/assistant")).toBe(true)
    expect(shouldHideFloatingAssistant("/dashboard/assistant/history")).toBe(true)
    expect(shouldHideFloatingAssistant("/dashboard/posts")).toBe(false)
  })
})
