import { describe, expect, it } from "vitest"
import { ASSISTANT_MOBILE_BREAKPOINT, isAssistantMobileWidth } from "@/lib/assistant/mobile-layout"

describe("assistant mobile layout helpers", () => {
  it("treats widths below the tablet breakpoint as mobile", () => {
    expect(isAssistantMobileWidth(320)).toBe(true)
    expect(isAssistantMobileWidth(ASSISTANT_MOBILE_BREAKPOINT - 1)).toBe(true)
  })

  it("treats tablet and desktop widths as non-mobile", () => {
    expect(isAssistantMobileWidth(ASSISTANT_MOBILE_BREAKPOINT)).toBe(false)
    expect(isAssistantMobileWidth(1024)).toBe(false)
  })
})
