import { describe, expect, it } from "vitest"
import {
  ASSISTANT_HORIZONTAL_SCROLL_CLASS,
  ASSISTANT_MODE_GRID_CLASS,
  ASSISTANT_QUICK_ACTION_GRID_CLASS,
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

  it("keeps icon targets roomy and pill controls compact", () => {
    expect(ASSISTANT_TOUCH_ICON_BUTTON_CLASS).toContain("h-10")
    expect(ASSISTANT_TOUCH_ICON_BUTTON_CLASS).toContain("w-10")
    expect(ASSISTANT_TOUCH_PILL_BUTTON_CLASS).toContain("min-h-9")
    expect(ASSISTANT_TOUCH_PILL_BUTTON_CLASS).toContain("md:min-h-10")
    expect(ASSISTANT_TOUCH_PILL_BUTTON_CLASS).toContain("min-w-0")
  })

  it("keeps mobile controls compact before restoring desktop rows", () => {
    expect(ASSISTANT_MODE_GRID_CLASS).toContain("grid-cols-5")
    expect(ASSISTANT_MODE_GRID_CLASS).toContain("md:flex")
    expect(ASSISTANT_QUICK_ACTION_GRID_CLASS).toContain("flex")
    expect(ASSISTANT_QUICK_ACTION_GRID_CLASS).toContain("overflow-x-auto")
    expect(ASSISTANT_QUICK_ACTION_GRID_CLASS).not.toContain("grid-cols-2")
  })
})
