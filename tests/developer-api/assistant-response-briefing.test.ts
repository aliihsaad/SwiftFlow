import { describe, expect, it } from "vitest"
import { buildAssistantBriefing, stripAssistantMarkdown } from "@/lib/assistant/response-briefing"

describe("assistant response briefing", () => {
  it("extracts metrics and scannable sections from dense markdown analysis", () => {
    const briefing = buildAssistantBriefing(`### Performance Summary:
**Total Views:** 1,201
**Total Likes:** 148
**Total Comments:** 109
**Total Saves:** 12
**Published Posts:** 48

### Engagement Insights:
Your engagement seems to peak with posts that focus on practical applications of AI tools. Comments and shares show that prompt discussion keeps landing.

### Content Suggestions for Next Posts:
- Practical AI workflows.
- Short prompt teardown.
- Behind the build proof.

### Timing:
Post at 08:00 UTC and reuse the topic that already pulled comments.`)

    expect(briefing.kind).toBe("analysis")
    expect(briefing.metrics.map((metric) => [metric.label, metric.value])).toEqual([
      ["Views", "1,201"],
      ["Likes", "148"],
      ["Comments", "109"],
      ["Saves", "12"],
      ["Posts", "48"],
    ])
    expect(briefing.sections).toEqual([
      {
        title: "What happened",
        items: [
          "Your engagement seems to peak with posts that focus on practical applications of AI tools.",
          "Comments and shares show that prompt discussion keeps landing.",
        ],
      },
      {
        title: "Post next",
        items: ["Practical AI workflows.", "Short prompt teardown.", "Behind the build proof."],
      },
      {
        title: "Timing",
        items: ["Post at 08:00 UTC and reuse the topic that already pulled comments."],
      },
    ])
  })

  it("removes markdown markers from assistant copy", () => {
    expect(stripAssistantMarkdown("### **Next:** Use `AI workflows` now.")).toBe("Next: Use AI workflows now.")
  })

  it("understands the assistant briefing contract labels", () => {
    const briefing = buildAssistantBriefing(`BRIEF: Prompt breakdowns are carrying the account right now.
METRICS: Views=1,201, Likes=148, Comments=109, Saves=12, Posts=48
WHAT HAPPENED:
- Practical AI topics are creating the strongest comment volume.
POST NEXT:
- Turn one prompt teardown into a quick carousel.
TIMING:
- Keep testing 08:00 UTC before changing cadence.
ACTIONS:
- Draft one post around Claude Code vs Codex.`)

    expect(briefing.summary).toBe("Prompt breakdowns are carrying the account right now.")
    expect(briefing.metrics).toContainEqual({ label: "Views", value: "1,201" })
    expect(briefing.sections.map((section) => section.title)).toEqual([
      "What happened",
      "Post next",
      "Timing",
      "Actions",
    ])
  })
})
