/**
 * Tier-aware retention policy resolution for the retention-cleanup Edge
 * Function. Pure TypeScript (no Deno/Node APIs) so it is unit-testable from
 * the Vitest suite and importable from the Deno runtime alike.
 *
 * Day/hour values of a policy answer: "delete rows older than this". Null
 * override columns on workspace_retention_policies fall back to the tier
 * defaults below.
 */

export type RetentionTier = "free" | "pro" | "agency"

export type RetentionPolicy = {
    logRetentionDays: number
    analyticsRetentionDays: number
    messageRetentionDays: number
    generatedAssetRetentionDays: number
    mediaRetentionDays: number
    auditLogRetentionDays: number
    tempSessionRetentionHours: number
    inviteRetentionDays: number
}

export const RETENTION_TIER_DEFAULTS: Record<RetentionTier, RetentionPolicy> = {
    free: {
        logRetentionDays: 30,
        analyticsRetentionDays: 90,
        messageRetentionDays: 180,
        generatedAssetRetentionDays: 90,
        mediaRetentionDays: 90,
        auditLogRetentionDays: 180,
        tempSessionRetentionHours: 24,
        inviteRetentionDays: 30,
    },
    pro: {
        logRetentionDays: 90,
        analyticsRetentionDays: 365,
        messageRetentionDays: 365,
        generatedAssetRetentionDays: 365,
        mediaRetentionDays: 365,
        auditLogRetentionDays: 365,
        tempSessionRetentionHours: 24,
        inviteRetentionDays: 30,
    },
    agency: {
        logRetentionDays: 180,
        analyticsRetentionDays: 730,
        messageRetentionDays: 730,
        generatedAssetRetentionDays: 730,
        mediaRetentionDays: 730,
        auditLogRetentionDays: 730,
        tempSessionRetentionHours: 24,
        inviteRetentionDays: 30,
    },
}

export type RetentionPolicyRow = {
    log_retention_days: number | null
    analytics_retention_days: number | null
    message_retention_days: number | null
    generated_asset_retention_days: number | null
    media_retention_days: number | null
    audit_log_retention_days: number | null
    temp_session_retention_hours: number | null
    invite_retention_days: number | null
    legal_hold_until: string | null
    cleanup_paused_until: string | null
    export_requested_at: string | null
    export_completed_at: string | null
}

function positiveOrDefault(value: number | null | undefined, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback
}

export function resolveRetentionPolicy(tier: RetentionTier, row: RetentionPolicyRow | null): RetentionPolicy {
    const defaults = RETENTION_TIER_DEFAULTS[tier]
    if (!row) return defaults
    return {
        logRetentionDays: positiveOrDefault(row.log_retention_days, defaults.logRetentionDays),
        analyticsRetentionDays: positiveOrDefault(row.analytics_retention_days, defaults.analyticsRetentionDays),
        messageRetentionDays: positiveOrDefault(row.message_retention_days, defaults.messageRetentionDays),
        generatedAssetRetentionDays: positiveOrDefault(row.generated_asset_retention_days, defaults.generatedAssetRetentionDays),
        mediaRetentionDays: positiveOrDefault(row.media_retention_days, defaults.mediaRetentionDays),
        auditLogRetentionDays: positiveOrDefault(row.audit_log_retention_days, defaults.auditLogRetentionDays),
        tempSessionRetentionHours: positiveOrDefault(row.temp_session_retention_hours, defaults.tempSessionRetentionHours),
        inviteRetentionDays: positiveOrDefault(row.invite_retention_days, defaults.inviteRetentionDays),
    }
}

export type CleanupEligibility = {
    skipWorkspace: boolean
    skipUserVisible: boolean
    reason: "legal_hold" | "cleanup_paused" | "export_pending" | null
}

/**
 * Legal hold and cleanup pause block the whole workspace; a requested but
 * uncompleted export blocks only user-visible data (ops logs may still be
 * trimmed).
 */
export function evaluateCleanupEligibility(row: RetentionPolicyRow | null, now: Date = new Date()): CleanupEligibility {
    if (!row) return { skipWorkspace: false, skipUserVisible: false, reason: null }

    if (row.legal_hold_until && new Date(row.legal_hold_until) > now) {
        return { skipWorkspace: true, skipUserVisible: true, reason: "legal_hold" }
    }
    if (row.cleanup_paused_until && new Date(row.cleanup_paused_until) > now) {
        return { skipWorkspace: true, skipUserVisible: true, reason: "cleanup_paused" }
    }
    if (row.export_requested_at && !row.export_completed_at) {
        return { skipWorkspace: false, skipUserVisible: true, reason: "export_pending" }
    }
    return { skipWorkspace: false, skipUserVisible: false, reason: null }
}

export function cutoffIsoDays(days: number, now: Date = new Date()): string {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

export function cutoffIsoHours(hours: number, now: Date = new Date()): string {
    return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString()
}

/**
 * Effective tier for retention purposes. Mirrors lib/billing/plans.ts:
 * active-ish statuses keep the paid tier; after cancellation the paid tier's
 * (longer) retention keeps applying through the downgrade grace window so
 * data is never trimmed to free-tier windows the moment a subscription ends.
 */
export function resolveRetentionTier(
    subscription: { plan_tier: RetentionTier; status: string; downgrade_grace_until: string | null } | null,
    now: Date = new Date(),
): RetentionTier {
    if (!subscription) return "free"
    if (["trialing", "active", "past_due"].includes(subscription.status)) return subscription.plan_tier
    if (subscription.downgrade_grace_until && new Date(subscription.downgrade_grace_until) > now) {
        return subscription.plan_tier
    }
    return "free"
}
