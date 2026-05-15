import { describe, expect, it } from "vitest"
import { buildAssistantBriefing } from "@/lib/assistant/response-briefing"
import {
  buildContextualAssistantActions,
  getAssistantModeActions,
  splitAssistantQuickActions,
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

  it("keeps only primary mode actions visible before the More menu", () => {
    const grouped = splitAssistantQuickActions(getAssistantModeActions("create"))

    expect(grouped.primary.map((action) => action.label)).toEqual(["Post idea", "Carousel", "Image"])
    expect(grouped.secondary.map((action) => action.label)).toEqual(["Schedule draft"])
  })

  it("routes broad create actions through setup flows instead of firing vague generation", () => {
    const createActions = getAssistantModeActions("create")

    expect(createActions.find((action) => action.id === "create-carousel")).toMatchObject({
      intent: "start_carousel_flow",
      guidance: "What should the carousel be about?",
    })
    expect(createActions.find((action) => action.id === "create-image")).toMatchObject({
      intent: "start_image_flow",
      guidance: "What should the image be about?",
    })
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
    expect(actions[1]).toMatchObject({
      functionName: "generate-carousel",
      intent: "start_carousel_flow",
    })
    expect(actions[2]).toMatchObject({
      functionName: "generate-image",
      intent: "start_image_flow",
    })
    expect(actions[1].prompt).toBe("Turn one Claude Code workflow into a quick carousel.")
  })

  it("does not show contextual actions when no recommendation exists", () => {
    const briefing = buildAssistantBriefing("Ask me anything about your social media workflow.")

    expect(buildContextualAssistantActions(briefing)).toEqual([])
  })
})
