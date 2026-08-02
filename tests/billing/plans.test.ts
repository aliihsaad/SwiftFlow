import { describe, expect, it } from "vitest"
import { PLAN_LIMITS, resolveEffectiveTier } from "@/lib/billing/plans"

describe("internal entitlement defaults", () => {
  it("contains only active workspace, AI-reply, automation, and analytics limits", () => {
    expect(PLAN_LIMITS.free).toMatchObject({
      maxWorkspaces: 1,
      maxTeamSeats: 1,
      maxSocialAccounts: 2,
      aiGenerationsPerMonth: 20,
      maxActiveAutomations: 1,
      developerApiEnabled: false,
      deepTrendReportsEnabled: false,
    })
    expect(PLAN_LIMITS.free).not.toHaveProperty("scheduledPostsPerMonth")
    expect(PLAN_LIMITS.free).not.toHaveProperty("generatedAssetQuotaBytes")
  })
})

describe("resolveEffectiveTier", () => {
  const now = new Date("2026-07-02T12:00:00Z")

  it("returns free without an entitlement subscription snapshot", () => {
    expect(resolveEffectiveTier(null, now)).toBe("free")
  })

  it("keeps active and grace-window tiers", () => {
    expect(resolveEffectiveTier({ planTier: "pro", status: "active", downgradeGraceUntil: null }, now)).toBe("pro")
    expect(resolveEffectiveTier({
      planTier: "agency",
      status: "canceled",
      downgradeGraceUntil: "2026-07-10T00:00:00Z",
    }, now)).toBe("agency")
  })

  it("falls back to free after terminal states and closed grace windows", () => {
    expect(resolveEffectiveTier({
      planTier: "agency",
      status: "canceled",
      downgradeGraceUntil: "2026-06-30T00:00:00Z",
    }, now)).toBe("free")
  })
})
