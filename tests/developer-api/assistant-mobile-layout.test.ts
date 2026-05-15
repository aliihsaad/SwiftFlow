import { describe, expect, it } from "vitest"
import {
  ASSISTANT_MOBILE_BREAKPOINT,
  ASSISTANT_MOBILE_SHELL_CLASS,
  isAssistantMobileWidth,
} from "@/lib/assistant/mobile-layout"

describe("assistant mobile layout helpers", () => {
  it("treats widths below the tablet breakpoint as mobile", () => {
    expect(isAssistantMobileWidth(320)).toBe(true)
    expect(isAssistantMobileWidth(ASSISTANT_MOBILE_BREAKPOINT - 1)).toBe(true)
  })

  it("treats tablet and desktop widths as non-mobile", () => {
    expect(isAssistantMobileWidth(ASSISTANT_MOBILE_BREAKPOINT)).toBe(false)
    expect(isAssistantMobileWidth(1024)).toBe(false)
  })

  it("keeps the mobile assistant shell embedded in dashboard chrome", () => {
    expect(ASSISTANT_MOBILE_SHELL_CLASS).toContain("h-[calc(100dvh-7.5rem)]")
    expect(ASSISTANT_MOBILE_SHELL_CLASS).not.toContain("fixed")
    expect(ASSISTANT_MOBILE_SHELL_CLASS).not.toContain("inset-0")
  })
})
