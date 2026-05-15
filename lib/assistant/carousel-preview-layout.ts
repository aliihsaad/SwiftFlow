export const CAROUSEL_SLIDE_FRAME_CLASS = "w-full min-w-0 overflow-hidden rounded-xl border border-white/10 bg-[#151620]"

export const CAROUSEL_SLIDE_TRACK_CLASS = [
  "flex",
  "w-full",
  "min-w-0",
  "gap-3",
  "overflow-x-auto",
  "overscroll-x-contain",
  "scroll-smooth",
  "snap-x",
  "snap-mandatory",
  "px-3",
  "pt-3",
  "pb-3",
  "sm:px-4",
  "sm:pt-4",
  "[-webkit-overflow-scrolling:touch]",
  "[touch-action:pan-x]",
  "[scrollbar-width:thin]",
].join(" ")

export const CAROUSEL_SLIDE_CARD_CLASS = [
  "flex",
  "h-auto",
  "min-h-[320px]",
  "w-[min(82vw,280px)]",
  "shrink-0",
  "snap-start",
  "flex-col",
  "gap-3",
  "border-white/10",
  "bg-[#1b1d28]",
  "p-4",
  "text-white/85",
  "sm:w-[280px]",
].join(" ")
