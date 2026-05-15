import { describe, expect, it } from "vitest"
import {
  ASSISTANT_HORIZONTAL_SCROLL_CLASS,
  ASSISTANT_TOUCH_ICON_BUTTON_CLASS,
  ASSISTANT_TOUCH_PILL_BUTTON_CLASS,
} from "@/lib/assistant/mobile-control-layout"

describe("assistant mobile control layout helpers", () => {
  it("keeps horizontal control rows touch-scrollable", () => {
    expect(ASSISTANT_HORIZONTAL_SCROLL_CLASS).toContain("overflow-x-auto")
    expect(ASSISTANT_HORIZONTAL_SCROLL_CLASS).toContain("overscroll-x-contain")
    expect(ASSISTANT_HORIZONTAL_SCROLL_CLASS).toContain("[-webkit-overflow-scrolling:touch]")
    expect(ASSISTANT_HORIZONTAL_SCROLL_CLASS).toContain("[touch-action:pan-x]")
  })

  it("uses thumb-sized tap targets for icon and pill controls", () => {
    expect(ASSISTANT_TOUCH_ICON_BUTTON_CLASS).toContain("h-10")
    expect(ASSISTANT_TOUCH_ICON_BUTTON_CLASS).toContain("w-10")
    expect(ASSISTANT_TOUCH_PILL_BUTTON_CLASS).toContain("min-h-10")
    expect(ASSISTANT_TOUCH_PILL_BUTTON_CLASS).toContain("shrink-0")
  })
})
