import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  UNSUPPORTED_APPROVAL_MODE_MESSAGE,
  isUnsupportedApprovalMode,
  sanitizeCreatePublishingAutomationPayload,
  sanitizeMergedPublishingAutomationPayload,
  sanitizeUpdatePublishingAutomationPayload,
} from "@/lib/publishing-automation-validation"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function createBody(approvalMode: string) {
  return {
    name: "Test automation",
    content_goal: "Grow engagement with consistent branded posts",
    platforms: ["facebook"],
    approval_mode: approvalMode,
    workflow_config: {
      idea_mode: "generate_new",
      caption_mode: "generate",
      media_mode: "none",
      platform_mode: "facebook_only",
      caption_strategy: "same_caption",
      approval_mode: approvalMode,
      schedule_mode: approvalMode === "manual_review" ? "manual_run_only" : "next_available_slot",
    },
  }
}

describe("approval mode guardrails", () => {
  it("flags auto_schedule and auto_publish as unsupported", () => {
    expect(isUnsupportedApprovalMode("auto_schedule")).toBe(true)
    expect(isUnsupportedApprovalMode("auto_publish")).toBe(true)
    expect(isUnsupportedApprovalMode("manual_review")).toBe(false)
    expect(isUnsupportedApprovalMode(undefined)).toBe(false)
  })

  it("accepts manual_review on create", () => {
    const payload = sanitizeCreatePublishingAutomationPayload(createBody("manual_review"))
    expect(payload.approval_mode).toBe("manual_review")
  })

  it("rejects auto_schedule and auto_publish on create", () => {
    expect(() => sanitizeCreatePublishingAutomationPayload(createBody("auto_schedule")))
      .toThrow(UNSUPPORTED_APPROVAL_MODE_MESSAGE)
    expect(() => sanitizeCreatePublishingAutomationPayload(createBody("auto_publish")))
      .toThrow(UNSUPPORTED_APPROVAL_MODE_MESSAGE)
  })

  it("rejects explicitly setting an unsupported approval mode on update", () => {
    expect(() => sanitizeUpdatePublishingAutomationPayload({ approval_mode: "auto_schedule" }))
      .toThrow(UNSUPPORTED_APPROVAL_MODE_MESSAGE)
    expect(() => sanitizeUpdatePublishingAutomationPayload({ approval_mode: "auto_publish" }))
      .toThrow(UNSUPPORTED_APPROVAL_MODE_MESSAGE)
    expect(sanitizeUpdatePublishingAutomationPayload({ approval_mode: "manual_review" }).approval_mode)
      .toBe("manual_review")
  })

  it("keeps legacy auto_* rows loadable for re-validation", () => {
    const payload = sanitizeCreatePublishingAutomationPayload(
      createBody("auto_schedule"),
      { allowUnsupportedApprovalModes: true },
    )
    expect(payload.approval_mode).toBe("auto_schedule")
  })

  it("keeps legacy auto_* rows editable without touching approval mode", () => {
    const legacyCurrent = sanitizeCreatePublishingAutomationPayload(
      createBody("auto_schedule"),
      { allowUnsupportedApprovalModes: true },
    )

    const merged = sanitizeMergedPublishingAutomationPayload(legacyCurrent, { name: "Renamed automation" })
    expect(merged.name).toBe("Renamed automation")
    expect(merged.approval_mode).toBe("auto_schedule")

    // And switching a legacy row back to manual_review works.
    const fixed = sanitizeMergedPublishingAutomationPayload(legacyCurrent, {
      approval_mode: "manual_review",
      workflow_config: { ...legacyCurrent.workflow_config, approval_mode: "manual_review", schedule_mode: "manual_run_only" },
    })
    expect(fixed.approval_mode).toBe("manual_review")
  })

  it("keeps activation of non-manual automations rejected in the API routes", () => {
    const toggleRoute = source("app", "api", "publishing-automations", "[id]", "toggle", "route.ts")
    expect(toggleRoute).toContain("approval_mode_not_supported")
    expect(toggleRoute).toMatch(/isActive && approvalMode !== 'manual_review'/)

    const updateRoute = source("app", "api", "publishing-automations", "[id]", "route.ts")
    expect(updateRoute).toContain("approval_mode_not_supported")
    expect(updateRoute).toMatch(/nextIsActive && merged\.approval_mode !== 'manual_review'/)
  })
})
