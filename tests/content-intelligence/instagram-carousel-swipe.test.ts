import { describe, expect, it } from "vitest"
import { getCarouselSwipeIntent } from "@/lib/create/carousel-swipe"

describe("instagram carousel swipe helper", () => {
  it("moves to the next slide on a left swipe", () => {
    expect(getCarouselSwipeIntent({ startX: 260, endX: 120, startY: 200, endY: 214 })).toBe("next")
  })

  it("moves to the previous slide on a right swipe", () => {
    expect(getCarouselSwipeIntent({ startX: 90, endX: 190, startY: 180, endY: 174 })).toBe("previous")
  })

  it("ignores small or mostly vertical gestures", () => {
    expect(getCarouselSwipeIntent({ startX: 120, endX: 102, startY: 180, endY: 184 })).toBe(null)
    expect(getCarouselSwipeIntent({ startX: 240, endX: 120, startY: 100, endY: 230 })).toBe(null)
  })
})
