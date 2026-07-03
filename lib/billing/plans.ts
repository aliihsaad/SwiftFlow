/**
 * Plan tier definitions and Stripe Price mapping.
 *
 * Stripe Prices (not deprecated Plan objects) are configured via env vars so
 * no price IDs live in code. Tier limits here are the single source of
 * defaults; per-workspace overrides live as nullable columns on
 * workspace_entitlements and are merged in lib/billing/entitlements.ts.
 */

export type PlanTier = "free" | "pro" | "agency"
export type BillingInterval = "month" | "year"

export const PLAN_TIERS: PlanTier[] = ["free", "pro", "agency"]

export type PlanLimits = {
    maxWorkspaces: number
    maxTeamSeats: number
    maxSocialAccounts: number
    aiGenerationsPerMonth: number
    scheduledPostsPerMonth: number
    maxActiveAutomations: number
    mediaQuotaBytes: number
    generatedAssetQuotaBytes: number
    developerApiEnabled: boolean
    deepTrendReportsEnabled: boolean
}

const MB = 1024 * 1024
const GB = 1024 * MB

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    free: {
        maxWorkspaces: 1,
        maxTeamSeats: 1,
        maxSocialAccounts: 2,
        aiGenerationsPerMonth: 20,
        scheduledPostsPerMonth: 30,
        maxActiveAutomations: 1,
        mediaQuotaBytes: 512 * MB,
        generatedAssetQuotaBytes: 256 * MB,
        developerApiEnabled: false,
        deepTrendReportsEnabled: false,
    },
    pro: {
        maxWorkspaces: 3,
        maxTeamSeats: 5,
        maxSocialAccounts: 10,
        aiGenerationsPerMonth: 500,
        scheduledPostsPerMonth: 500,
        maxActiveAutomations: 10,
        mediaQuotaBytes: 10 * GB,
        generatedAssetQuotaBytes: 5 * GB,
        developerApiEnabled: true,
        deepTrendReportsEnabled: true,
    },
    agency: {
        maxWorkspaces: 10,
        maxTeamSeats: 20,
        maxSocialAccounts: 50,
        aiGenerationsPerMonth: 5000,
        scheduledPostsPerMonth: 5000,
        maxActiveAutomations: 50,
        mediaQuotaBytes: 100 * GB,
        generatedAssetQuotaBytes: 50 * GB,
        developerApiEnabled: true,
        deepTrendReportsEnabled: true,
    },
}

export type PaidPlanTier = Exclude<PlanTier, "free">

const PRICE_ENV_KEYS: Record<PaidPlanTier, Record<BillingInterval, string>> = {
    pro: {
        month: "STRIPE_PRICE_PRO_MONTHLY",
        year: "STRIPE_PRICE_PRO_YEARLY",
    },
    agency: {
        month: "STRIPE_PRICE_AGENCY_MONTHLY",
        year: "STRIPE_PRICE_AGENCY_YEARLY",
    },
}

/** Returns the configured Stripe Price ID for a paid tier, or null when unset. */
export function getConfiguredPriceId(tier: PaidPlanTier, interval: BillingInterval): string | null {
    const value = process.env[PRICE_ENV_KEYS[tier][interval]]?.trim()
    return value || null
}

/** Maps a Stripe Price ID from a webhook back to the plan tier it sells. */
export function resolvePlanTierFromPriceId(priceId: string | null | undefined): PlanTier {
    if (!priceId) return "free"
    for (const tier of ["pro", "agency"] as PaidPlanTier[]) {
        for (const interval of ["month", "year"] as BillingInterval[]) {
            if (getConfiguredPriceId(tier, interval) === priceId) return tier
        }
    }
    return "free"
}

/**
 * A workspace with a live (or dunning) subscription must change plans through
 * the Customer Portal; starting a second Checkout would create a duplicate
 * Stripe subscription for the same workspace.
 */
export function isCheckoutBlockedByStatus(status: string | null | undefined): boolean {
    return Boolean(status && ["trialing", "active", "past_due"].includes(status))
}

export type SubscriptionSnapshot = {
    planTier: PlanTier
    status: string
    downgradeGraceUntil: string | null
}

/**
 * Maps raw subscription state to the tier a workspace should currently get.
 * trialing/active/past_due keep paid access (past_due is dunning grace);
 * everything else falls back to free unless a downgrade grace window is open.
 */
export function resolveEffectiveTier(subscription: SubscriptionSnapshot | null, now: Date = new Date()): PlanTier {
    if (!subscription) return "free"

    if (["trialing", "active", "past_due"].includes(subscription.status)) {
        return subscription.planTier
    }

    if (subscription.downgradeGraceUntil && new Date(subscription.downgradeGraceUntil) > now) {
        return subscription.planTier
    }

    return "free"
}
