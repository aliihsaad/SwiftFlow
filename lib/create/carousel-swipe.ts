export type CarouselSwipeIntent = "next" | "previous" | null

interface CarouselSwipeInput {
  startX: number
  endX: number
  startY: number
  endY: number
  threshold?: number
  maxVerticalDrift?: number
}

export function getCarouselSwipeIntent({
  startX,
  endX,
  startY,
  endY,
  threshold = 48,
  maxVerticalDrift = 72,
}: CarouselSwipeInput): CarouselSwipeIntent {
  const deltaX = endX - startX
  const deltaY = endY - startY
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  if (absX < threshold) return null
  if (absY > maxVerticalDrift || absY > absX * 0.75) return null

  return deltaX < 0 ? "next" : "previous"
}
