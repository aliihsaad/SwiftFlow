export const ASSISTANT_HORIZONTAL_SCROLL_CLASS = [
  "overflow-x-auto",
  "overscroll-x-contain",
  "[-webkit-overflow-scrolling:touch]",
  "[touch-action:pan-x]",
  "[-ms-overflow-style:none]",
  "[scrollbar-width:none]",
  "[&::-webkit-scrollbar]:hidden",
].join(" ")

export const ASSISTANT_TOUCH_ICON_BUTTON_CLASS = "h-10 w-10 shrink-0"

export const ASSISTANT_TOUCH_PILL_BUTTON_CLASS = "min-h-9 min-w-0 md:min-h-10"

export const ASSISTANT_MODE_GRID_CLASS = [
  "grid",
  "grid-cols-5",
  "gap-1",
  "pb-0.5",
  "md:flex",
  "md:gap-1.5",
  "md:pb-1",
  "md:overflow-x-auto",
  "md:overscroll-x-contain",
  "md:[-webkit-overflow-scrolling:touch]",
  "md:[touch-action:pan-x]",
  "md:[-ms-overflow-style:none]",
  "md:[scrollbar-width:none]",
  "md:[&::-webkit-scrollbar]:hidden",
].join(" ")

export const ASSISTANT_QUICK_ACTION_GRID_CLASS = [
  "flex",
  "gap-1.5",
  "pb-1",
  "overflow-x-auto",
  "overscroll-x-contain",
  "[-webkit-overflow-scrolling:touch]",
  "[touch-action:pan-x]",
  "[-ms-overflow-style:none]",
  "[scrollbar-width:none]",
  "[&::-webkit-scrollbar]:hidden",
  "md:gap-2",
].join(" ")
