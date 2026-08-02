/**
 * Internal plan limits used by workspace, automation, AI-reply, analytics,
 * and Developer API entitlement checks. Managed checkout is not part of this
 * self-hosted release.
 */

export type PlanTier = "free" | "pro" | "agency"

export const PLAN_TIERS: PlanTier[] = ["free", "pro", "agency"]

export type PlanLimits = {
    maxWorkspaces: number
    maxTeamSeats: number
    maxSocialAccounts: number
    aiGenerationsPerMonth: number
    maxActiveAutomations: number
    developerApiEnabled: boolean
    deepTrendReportsEnabled: boolean
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
    free: {
        maxWorkspaces: 1,
        maxTeamSeats: 1,
        maxSocialAccounts: 2,
        aiGenerationsPerMonth: 20,
        maxActiveAutomations: 1,
        developerApiEnabled: false,
        deepTrendReportsEnabled: false,
    },
    pro: {
        maxWorkspaces: 3,
        maxTeamSeats: 5,
        maxSocialAccounts: 10,
        aiGenerationsPerMonth: 500,
        maxActiveAutomations: 10,
        developerApiEnabled: true,
        deepTrendReportsEnabled: true,
    },
    agency: {
        maxWorkspaces: 10,
        maxTeamSeats: 20,
        maxSocialAccounts: 50,
        aiGenerationsPerMonth: 5000,
        maxActiveAutomations: 50,
        developerApiEnabled: true,
        deepTrendReportsEnabled: true,
    },
}

export type SubscriptionSnapshot = {
    planTier: PlanTier
    status: string
    downgradeGraceUntil: string | null
}

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
