import { describe, expect, it } from "vitest"
import {
    cutoffIsoDays,
    cutoffIsoHours,
    evaluateCleanupEligibility,
    resolveRetentionPolicy,
    resolveRetentionTier,
    RETENTION_TIER_DEFAULTS,
    type RetentionPolicyRow,
} from "@/supabase/functions/_shared/retention-policy"

const now = new Date("2026-07-02T12:00:00Z")

const emptyRow: RetentionPolicyRow = {
    log_retention_days: null,
    analytics_retention_days: null,
    message_retention_days: null,
    generated_asset_retention_days: null,
    media_retention_days: null,
    audit_log_retention_days: null,
    temp_session_retention_hours: null,
    invite_retention_days: null,
    legal_hold_until: null,
    cleanup_paused_until: null,
    export_requested_at: null,
    export_completed_at: null,
}

describe("resolveRetentionPolicy", () => {
    it("uses tier defaults when no override row exists", () => {
        expect(resolveRetentionPolicy("free", null)).toEqual(RETENTION_TIER_DEFAULTS.free)
        expect(resolveRetentionPolicy("agency", null).logRetentionDays).toBe(180)
    })

    it("keeps paid tiers on longer windows than free", () => {
        expect(RETENTION_TIER_DEFAULTS.pro.messageRetentionDays)
            .toBeGreaterThan(RETENTION_TIER_DEFAULTS.free.messageRetentionDays)
        expect(RETENTION_TIER_DEFAULTS.agency.logRetentionDays)
            .toBeGreaterThan(RETENTION_TIER_DEFAULTS.pro.logRetentionDays)
    })

    it("applies positive overrides and rejects zero/negative values", () => {
        const policy = resolveRetentionPolicy("free", {
            ...emptyRow,
            log_retention_days: 7,
            message_retention_days: 0,
        })
        expect(policy.logRetentionDays).toBe(7)
        expect(policy.messageRetentionDays).toBe(RETENTION_TIER_DEFAULTS.free.messageRetentionDays)
    })
})

describe("evaluateCleanupEligibility", () => {
    it("allows cleanup with no policy row", () => {
        expect(evaluateCleanupEligibility(null, now)).toEqual({
            skipWorkspace: false,
            skipUserVisible: false,
            reason: null,
        })
    })

    it("blocks the whole workspace under an active legal hold", () => {
        const result = evaluateCleanupEligibility({ ...emptyRow, legal_hold_until: "2026-08-01T00:00:00Z" }, now)
        expect(result).toEqual({ skipWorkspace: true, skipUserVisible: true, reason: "legal_hold" })
    })

    it("ignores an expired legal hold", () => {
        const result = evaluateCleanupEligibility({ ...emptyRow, legal_hold_until: "2026-06-01T00:00:00Z" }, now)
        expect(result.skipWorkspace).toBe(false)
    })

    it("blocks the whole workspace while cleanup is paused", () => {
        const result = evaluateCleanupEligibility({ ...emptyRow, cleanup_paused_until: "2026-07-03T00:00:00Z" }, now)
        expect(result).toEqual({ skipWorkspace: true, skipUserVisible: true, reason: "cleanup_paused" })
    })

    it("blocks only user-visible data while an export is pending", () => {
        const result = evaluateCleanupEligibility({ ...emptyRow, export_requested_at: "2026-07-01T00:00:00Z" }, now)
        expect(result).toEqual({ skipWorkspace: false, skipUserVisible: true, reason: "export_pending" })
    })

    it("resumes user-visible cleanup after the export completes", () => {
        const result = evaluateCleanupEligibility({
            ...emptyRow,
            export_requested_at: "2026-07-01T00:00:00Z",
            export_completed_at: "2026-07-01T06:00:00Z",
        }, now)
        expect(result.skipUserVisible).toBe(false)
    })
})

describe("resolveRetentionTier", () => {
    it("keeps paid retention through the downgrade grace window", () => {
        const canceledInGrace = {
            plan_tier: "pro" as const,
            status: "canceled",
            downgrade_grace_until: "2026-07-10T00:00:00Z",
        }
        expect(resolveRetentionTier(canceledInGrace, now)).toBe("pro")

        const canceledPastGrace = { ...canceledInGrace, downgrade_grace_until: "2026-06-30T00:00:00Z" }
        expect(resolveRetentionTier(canceledPastGrace, now)).toBe("free")
    })

    it("returns free without a subscription", () => {
        expect(resolveRetentionTier(null, now)).toBe("free")
    })
})

describe("cutoff helpers", () => {
    it("computes day and hour cutoffs", () => {
        expect(cutoffIsoDays(30, now)).toBe("2026-06-02T12:00:00.000Z")
        expect(cutoffIsoHours(24, now)).toBe("2026-07-01T12:00:00.000Z")
    })
})
