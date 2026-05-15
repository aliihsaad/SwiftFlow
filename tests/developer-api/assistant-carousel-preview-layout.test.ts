import { describe, expect, it } from "vitest"
import {
  CAROUSEL_SLIDE_FRAME_CLASS,
  CAROUSEL_SLIDE_CARD_CLASS,
  CAROUSEL_SLIDE_TRACK_CLASS,
} from "@/lib/assistant/carousel-preview-layout"

describe("assistant carousel preview mobile layout", () => {
  it("uses native horizontal touch scrolling for generated slides", () => {
    expect(CAROUSEL_SLIDE_FRAME_CLASS).toContain("min-w-0")
    expect(CAROUSEL_SLIDE_FRAME_CLASS).toContain("overflow-hidden")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("overflow-x-auto")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("min-w-0")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("snap-x")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("[touch-action:pan-x]")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("[-webkit-overflow-scrolling:touch]")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).not.toContain("touch-none")
  })

  it("keeps each slide swipeable without shrinking below mobile width", () => {
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("shrink-0")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("snap-start")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("w-[min(82vw,280px)]")
  })
})
