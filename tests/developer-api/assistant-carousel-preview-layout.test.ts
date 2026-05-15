import { describe, expect, it } from "vitest"
import {
  CAROUSEL_SLIDE_FRAME_CLASS,
  CAROUSEL_SLIDE_CARD_CLASS,
  CAROUSEL_SLIDE_TRACK_CLASS,
} from "@/lib/assistant/carousel-preview-layout"

describe("assistant carousel preview mobile layout", () => {
  it("keeps generated slides vertical on mobile so they cannot stretch the chat column", () => {
    expect(CAROUSEL_SLIDE_FRAME_CLASS).toContain("min-w-0")
    expect(CAROUSEL_SLIDE_FRAME_CLASS).toContain("overflow-hidden")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("flex-col")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("overflow-x-hidden")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("min-w-0")
    expect(CAROUSEL_SLIDE_TRACK_CLASS.split(" ")).not.toContain("overflow-x-auto")
    expect(CAROUSEL_SLIDE_TRACK_CLASS.split(" ")).not.toContain("snap-x")
    expect(CAROUSEL_SLIDE_TRACK_CLASS.split(" ")).not.toContain("[touch-action:pan-x]")
  })

  it("keeps each mobile slide constrained to the chat width", () => {
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("w-full")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("max-w-full")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("min-w-0")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("shrink")
    expect(CAROUSEL_SLIDE_CARD_CLASS.split(" ")).not.toContain("shrink-0")
    expect(CAROUSEL_SLIDE_CARD_CLASS.split(" ")).not.toContain("snap-start")
    expect(CAROUSEL_SLIDE_CARD_CLASS).not.toContain("w-[calc(100%_-_1.5rem)]")
    expect(CAROUSEL_SLIDE_CARD_CLASS.split(" ")).not.toContain("max-w-[320px]")
  })

  it("restores the horizontal carousel only at the md desktop breakpoint", () => {
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("md:flex-row")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("md:overflow-x-auto")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("md:snap-x")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("md:[touch-action:pan-x]")
    expect(CAROUSEL_SLIDE_TRACK_CLASS).toContain("md:[-webkit-overflow-scrolling:touch]")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("md:min-h-[320px]")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("md:w-[280px]")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("md:max-w-[320px]")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("md:shrink-0")
    expect(CAROUSEL_SLIDE_CARD_CLASS).toContain("md:snap-start")
  })
})
