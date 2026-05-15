import { describe, expect, it } from "vitest"
import {
  getAssistantMobileServerSnapshot,
  getAssistantMobileSnapshot,
  subscribeAssistantMobileChange,
} from "@/lib/hooks/use-is-mobile"

describe("assistant mobile breakpoint hydration", () => {
  it("uses the desktop snapshot during server hydration", () => {
    expect(getAssistantMobileServerSnapshot()).toBe(false)
  })

  it("does not read browser width when no window exists", () => {
    expect(getAssistantMobileSnapshot()).toBe(false)
    const unsubscribe = subscribeAssistantMobileChange(() => undefined)
    expect(unsubscribe()).toBeUndefined()
  })
})
