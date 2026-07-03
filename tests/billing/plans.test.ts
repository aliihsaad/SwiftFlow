import { afterEach, describe, expect, it } from "vitest"
import {
    getConfiguredPriceId,
    isCheckoutBlockedByStatus,
    resolveEffectiveTier,
    resolvePlanTierFromPriceId,
} from "@/lib/billing/plans"

const PRICE_ENV_KEYS = [
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PRICE_PRO_YEARLY",
    "STRIPE_PRICE_AGENCY_MONTHLY",
    "STRIPE_PRICE_AGENCY_YEARLY",
]

afterEach(() => {
    for (const key of PRICE_ENV_KEYS) delete process.env[key]
})

describe("price configuration", () => {
    it("returns null when a price is not configured", () => {
        expect(getConfiguredPriceId("pro", "month")).toBeNull()
    })

    it("maps configured price IDs back to their tier", () => {
        process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m"
        process.env.STRIPE_PRICE_AGENCY_YEARLY = "price_agency_y"

        expect(resolvePlanTierFromPriceId("price_pro_m")).toBe("pro")
        expect(resolvePlanTierFromPriceId("price_agency_y")).toBe("agency")
        expect(resolvePlanTierFromPriceId("price_unknown")).toBe("free")
        expect(resolvePlanTierFromPriceId(null)).toBe("free")
    })
})

describe("isCheckoutBlockedByStatus", () => {
    it("blocks new checkouts while a subscription is live or in dunning", () => {
        for (const status of ["trialing", "active", "past_due"]) {
            expect(isCheckoutBlockedByStatus(status)).toBe(true)
        }
    })

    it("allows resubscribing after terminal states and for new workspaces", () => {
        for (const status of ["canceled", "unpaid", "incomplete_expired", "none", null, undefined]) {
            expect(isCheckoutBlockedByStatus(status)).toBe(false)
        }
    })
})

describe("resolveEffectiveTier", () => {
    const now = new Date("2026-07-02T12:00:00Z")

    it("returns free without a subscription", () => {
        expect(resolveEffectiveTier(null, now)).toBe("free")
    })

    it("keeps the paid tier for trialing, active, and past_due", () => {
        for (const status of ["trialing", "active", "past_due"]) {
            expect(resolveEffectiveTier({ planTier: "pro", status, downgradeGraceUntil: null }, now)).toBe("pro")
        }
    })

    it("downgrades to free for terminal statuses", () => {
        for (const status of ["canceled", "unpaid", "incomplete_expired", "paused", "none"]) {
            expect(resolveEffectiveTier({ planTier: "pro", status, downgradeGraceUntil: null }, now)).toBe("free")
        }
    })

    it("honors an open downgrade grace window after cancellation", () => {
        const graceOpen = { planTier: "agency" as const, status: "canceled", downgradeGraceUntil: "2026-07-10T00:00:00Z" }
        const graceClosed = { planTier: "agency" as const, status: "canceled", downgradeGraceUntil: "2026-06-30T00:00:00Z" }

        expect(resolveEffectiveTier(graceOpen, now)).toBe("agency")
        expect(resolveEffectiveTier(graceClosed, now)).toBe("free")
    })
})
