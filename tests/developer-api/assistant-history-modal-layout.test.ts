import { describe, expect, it } from "vitest"
import {
  ASSISTANT_HISTORY_DELETE_DIALOG_CLASS,
  ASSISTANT_HISTORY_DIALOG_CLASS,
  ASSISTANT_HISTORY_ROW_CLASS,
  ASSISTANT_HISTORY_SCROLL_CLASS,
} from "@/lib/assistant/history-modal-layout"

describe("assistant history modal mobile layout", () => {
  it("uses a mobile bottom-sheet shape that stays within the viewport", () => {
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("!bottom-2")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("!top-auto")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("!translate-y-0")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("!w-[calc(100vw-1rem)]")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("max-h-[min(86dvh,640px)]")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("overflow-hidden")
  })

  it("restores the centered desktop shape at the md breakpoint", () => {
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("md:!bottom-auto")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("md:!top-[50%]")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("md:!translate-y-[-50%]")
    expect(ASSISTANT_HISTORY_DIALOG_CLASS).toContain("md:!max-w-[420px]")
  })

  it("keeps list rows thumb-friendly and scrollable on mobile", () => {
    expect(ASSISTANT_HISTORY_SCROLL_CLASS).toContain("h-[min(54dvh,360px)]")
    expect(ASSISTANT_HISTORY_ROW_CLASS).toContain("min-h-11")
    expect(ASSISTANT_HISTORY_DELETE_DIALOG_CLASS).toContain("!w-[calc(100vw-1rem)]")
  })
})
