import { describe, expect, it } from "vitest"
import { buildAssistantBriefing } from "@/lib/assistant/response-briefing"
import {
  buildContextualAssistantActions,
  getAssistantModeActions,
} from "@/lib/assistant/quick-actions"

describe("assistant quick actions", () => {
  it("returns focused actions for each assistant mode", () => {
    expect(getAssistantModeActions("analyze").map((action) => action.label)).toEqual([
      "Recent performance",
      "Best time",
      "Top posts",
      "Content gaps",
    ])

    expect(getAssistantModeActions("create").map((action) => action.label)).toEqual([
      "Post idea",
      "Carousel",
      "Image",
      "Schedule draft",
    ])
  })

  it("builds contextual generation actions from the post-next recommendation", () => {
    const briefing = buildAssistantBriefing(`BRIEF: Practical AI posts are working.
POST NEXT:
- Turn one Claude Code workflow into a quick carousel.
TIMING:
- Post mid-week.`)

    const actions = buildContextualAssistantActions(briefing)

    expect(actions.map((action) => [action.id, action.label])).toEqual([
      ["generate-post", "Generate post"],
      ["make-carousel", "Make carousel"],
      ["create-image", "Create image"],
      ["start-draft", "Start draft"],
    ])
    expect(actions[0].prompt).toContain("Turn one Claude Code workflow into a quick carousel")
    expect(actions[1].functionName).toBe("generate-carousel")
    expect(actions[2].functionName).toBe("generate-image")
  })

  it("does not show contextual actions when no recommendation exists", () => {
    const briefing = buildAssistantBriefing("Ask me anything about your social media workflow.")

    expect(buildContextualAssistantActions(briefing)).toEqual([])
  })
})
