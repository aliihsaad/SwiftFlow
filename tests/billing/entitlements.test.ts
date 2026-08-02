import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
    subscriptionRow: null as unknown,
    entitlementRow: null as unknown,
    ownedWorkspaces: [] as Array<{ id: string }>,
    subscriptionRows: [] as unknown[],
    entitlementRows: [] as unknown[],
}))

vi.mock("@/utils/supabase/admin", () => ({
    createAdminClient: () => ({
        from: (table: string) => ({
            select: () => ({
                // `.eq()` is awaited directly for list reads (workspaces by
                // owner) and chained with maybeSingle for single-row reads.
                eq: () => ({
                    maybeSingle: async () => ({
                        data: table === "workspace_subscriptions" ? state.subscriptionRow : state.entitlementRow,
                        error: null,
                    }),
                    then: (resolve: (value: unknown) => void) =>
                        resolve({ data: table === "workspaces" ? state.ownedWorkspaces : [], error: null }),
                }),
                in: () => Promise.resolve({
                    data: table === "workspace_subscriptions" ? state.subscriptionRows : state.entitlementRows,
                    error: null,
                }),
            }),
        }),
    }),
}))

import {
    checkUserWorkspaceLimit,
    checkWorkspaceFeature,
    checkWorkspaceLimit,
    getBillingEnforcementMode,
    getWorkspaceEntitlements,
    resolveWorkspaceEntitlementsFromRows,
} from "@/lib/billing/entitlements"

beforeEach(() => {
    state.subscriptionRow = null
    state.entitlementRow = null
    state.ownedWorkspaces = []
    state.subscriptionRows = []
    state.entitlementRows = []
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
    delete process.env.BILLING_ENFORCEMENT_MODE
    vi.restoreAllMocks()
})

describe("getBillingEnforcementMode", () => {
    it("defaults to off and ignores unknown values", () => {
        expect(getBillingEnforcementMode()).toBe("off")
        process.env.BILLING_ENFORCEMENT_MODE = "yes-please"
        expect(getBillingEnforcementMode()).toBe("off")
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        expect(getBillingEnforcementMode()).toBe("enforce")
    })
})

describe("resolveWorkspaceEntitlementsFromRows", () => {
    it("uses free defaults with no rows", () => {
        const result = resolveWorkspaceEntitlementsFromRows(null, null)
        expect(result.effectiveTier).toBe("free")
        expect(result.limits.developerApiEnabled).toBe(false)
        expect(result.limits.maxTeamSeats).toBe(1)
    })

    it("applies the paid tier from an active subscription", () => {
        const result = resolveWorkspaceEntitlementsFromRows(
            { plan_tier: "pro", status: "active", downgrade_grace_until: null },
            null,
        )
        expect(result.effectiveTier).toBe("pro")
        expect(result.limits.developerApiEnabled).toBe(true)
        expect(result.limits.deepTrendReportsEnabled).toBe(true)
    })

    it("lets manual entitlement rows pin the tier over subscription state", () => {
        const result = resolveWorkspaceEntitlementsFromRows(
            { plan_tier: "pro", status: "canceled", downgrade_grace_until: null },
            {
                plan_tier: "agency",
                entitlement_source: "manual",
                developer_api_enabled: true,
                deep_trend_reports_enabled: true,
                max_team_seats: null,
                max_social_accounts: null,
                ai_generations_per_month: null,
                max_active_automations: null,
            },
        )
        expect(result.effectiveTier).toBe("agency")
        expect(result.limits.maxTeamSeats).toBe(20)
    })

    it("applies per-workspace numeric overrides over tier defaults", () => {
        const result = resolveWorkspaceEntitlementsFromRows(
            { plan_tier: "pro", status: "active", downgrade_grace_until: null },
            {
                plan_tier: "pro",
                entitlement_source: "subscription",
                developer_api_enabled: true,
                deep_trend_reports_enabled: true,
                max_team_seats: 12,
                max_social_accounts: null,
                ai_generations_per_month: null,
                max_active_automations: null,
            },
        )
        expect(result.limits.maxTeamSeats).toBe(12)
        expect(result.limits.maxSocialAccounts).toBe(10)
    })
})

describe("enforcement modes", () => {
    it("off mode allows everything without reading billing state", async () => {
        const feature = await checkWorkspaceFeature("ws-1", "developer_api")
        expect(feature).toMatchObject({ allowed: true, enforced: false, reason: "enforcement_off" })

        const limit = await checkWorkspaceLimit("ws-1", "team_seats", async () => {
            throw new Error("usage getter must not run in off mode")
        })
        expect(limit.allowed).toBe(true)
    })

    it("log mode allows but records the would-be denial", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "log"
        const decision = await checkWorkspaceFeature("ws-1", "deep_trend_reports")
        expect(decision).toMatchObject({ allowed: true, enforced: false, reason: "plan_feature_required" })
        expect(console.warn).toHaveBeenCalled()
    })

    it("enforce mode denies features missing from the plan", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        const decision = await checkWorkspaceFeature("ws-1", "developer_api")
        expect(decision).toMatchObject({ allowed: false, enforced: true, reason: "plan_feature_required" })
    })

    it("enforce mode denies once a numeric limit is reached", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"

        const underLimit = await checkWorkspaceLimit("ws-1", "team_seats", 0)
        expect(underLimit.allowed).toBe(true)

        const atLimit = await checkWorkspaceLimit("ws-1", "team_seats", 1)
        expect(atLimit).toMatchObject({ allowed: false, reason: "plan_limit_reached", tier: "free" })
    })

    it("enforce mode allows paid features for active subscriptions", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        state.subscriptionRow = { plan_tier: "pro", status: "active", downgrade_grace_until: null }

        const decision = await checkWorkspaceFeature("ws-1", "developer_api")
        expect(decision).toMatchObject({ allowed: true, tier: "pro" })
    })
})

describe("checkUserWorkspaceLimit", () => {
    it("allows everything in off mode", async () => {
        const decision = await checkUserWorkspaceLimit("user-1")
        expect(decision).toMatchObject({ allowed: true, reason: "enforcement_off" })
    })

    it("denies a free owner at the one-workspace limit", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        state.ownedWorkspaces = [{ id: "ws-1" }]

        const decision = await checkUserWorkspaceLimit("user-1")
        expect(decision).toMatchObject({ allowed: false, reason: "plan_limit_reached", tier: "free" })
    })

    it("raises the allowance from the best owned workspace plan", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        state.ownedWorkspaces = [{ id: "ws-1" }, { id: "ws-2" }]
        state.subscriptionRows = [
            { workspace_id: "ws-1", plan_tier: "pro", status: "active", downgrade_grace_until: null },
        ]

        const decision = await checkUserWorkspaceLimit("user-1")
        expect(decision).toMatchObject({ allowed: true, tier: "pro" })
    })

    it("allows users with no workspaces yet", async () => {
        process.env.BILLING_ENFORCEMENT_MODE = "enforce"
        const decision = await checkUserWorkspaceLimit("user-1")
        expect(decision.allowed).toBe(true)
    })
})

describe("getWorkspaceEntitlements", () => {
    it("merges subscription and entitlement rows through the admin client", async () => {
        state.subscriptionRow = { plan_tier: "agency", status: "trialing", downgrade_grace_until: null }
        const result = await getWorkspaceEntitlements("ws-1")
        expect(result.effectiveTier).toBe("agency")
        expect(result.subscriptionStatus).toBe("trialing")
    })
})
