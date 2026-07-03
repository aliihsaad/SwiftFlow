import { createAdminClient } from "@/utils/supabase/admin"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import {
    PLAN_LIMITS,
    resolveEffectiveTier,
    type PlanLimits,
    type PlanTier,
} from "./plans"

/**
 * Single entitlement reader for all plan gates (Developer API, AI generation,
 * scheduling, automations, seats, social accounts, media quotas, deep trend
 * reports).
 *
 * BILLING_ENFORCEMENT_MODE controls whether denials are applied:
 *   - "off" (default): every check passes; no billing reads happen.
 *   - "log": checks run and would-be denials are logged, but still pass.
 *   - "enforce": denials are returned to callers.
 * Production enforcement therefore stays off until explicitly enabled.
 */

export type BillingEnforcementMode = "off" | "log" | "enforce"

export function getBillingEnforcementMode(): BillingEnforcementMode {
    const raw = process.env.BILLING_ENFORCEMENT_MODE
    if (raw === "log" || raw === "enforce") return raw
    return "off"
}

export type WorkspaceEntitlements = {
    planTier: PlanTier
    effectiveTier: PlanTier
    subscriptionStatus: string
    entitlementSource: "preview" | "manual" | "subscription" | "default"
    limits: PlanLimits
}

type EntitlementRow = {
    plan_tier: PlanTier | null
    entitlement_source: string | null
    developer_api_enabled: boolean | null
    deep_trend_reports_enabled: boolean | null
    max_workspaces?: number | null
    max_team_seats: number | null
    max_social_accounts: number | null
    ai_generations_per_month: number | null
    scheduled_posts_per_month: number | null
    max_active_automations: number | null
    media_quota_bytes: number | null
    generated_asset_quota_bytes: number | null
}

type SubscriptionRow = {
    plan_tier: PlanTier
    status: string
    downgrade_grace_until: string | null
}

export function resolveWorkspaceEntitlementsFromRows(
    subscription: SubscriptionRow | null,
    entitlementRow: EntitlementRow | null,
    now: Date = new Date(),
): WorkspaceEntitlements {
    const effectiveTier = resolveEffectiveTier(
        subscription
            ? {
                planTier: subscription.plan_tier,
                status: subscription.status,
                downgradeGraceUntil: subscription.downgrade_grace_until,
            }
            : null,
        now,
    )

    const source = (entitlementRow?.entitlement_source ?? "default") as WorkspaceEntitlements["entitlementSource"]

    // Manual entitlement rows pin the tier regardless of subscription state.
    const tier: PlanTier = source === "manual" && entitlementRow?.plan_tier
        ? entitlementRow.plan_tier
        : effectiveTier

    const defaults = PLAN_LIMITS[tier]
    const limits: PlanLimits = {
        maxWorkspaces: entitlementRow?.max_workspaces ?? defaults.maxWorkspaces,
        maxTeamSeats: entitlementRow?.max_team_seats ?? defaults.maxTeamSeats,
        maxSocialAccounts: entitlementRow?.max_social_accounts ?? defaults.maxSocialAccounts,
        aiGenerationsPerMonth: entitlementRow?.ai_generations_per_month ?? defaults.aiGenerationsPerMonth,
        scheduledPostsPerMonth: entitlementRow?.scheduled_posts_per_month ?? defaults.scheduledPostsPerMonth,
        maxActiveAutomations: entitlementRow?.max_active_automations ?? defaults.maxActiveAutomations,
        mediaQuotaBytes: entitlementRow?.media_quota_bytes ?? defaults.mediaQuotaBytes,
        generatedAssetQuotaBytes: entitlementRow?.generated_asset_quota_bytes ?? defaults.generatedAssetQuotaBytes,
        developerApiEnabled: entitlementRow?.developer_api_enabled ?? defaults.developerApiEnabled,
        deepTrendReportsEnabled: entitlementRow?.deep_trend_reports_enabled ?? defaults.deepTrendReportsEnabled,
    }

    return {
        planTier: subscription?.plan_tier ?? tier,
        effectiveTier: tier,
        subscriptionStatus: subscription?.status ?? "none",
        entitlementSource: source,
        limits,
    }
}

const FREE_DEFAULTS: WorkspaceEntitlements = {
    planTier: "free",
    effectiveTier: "free",
    subscriptionStatus: "none",
    entitlementSource: "default",
    limits: PLAN_LIMITS.free,
}

const SUBSCRIPTION_SELECT = "plan_tier, status, downgrade_grace_until"
const ENTITLEMENT_SELECT =
    "plan_tier, entitlement_source, developer_api_enabled, deep_trend_reports_enabled, " +
    "max_workspaces, max_team_seats, max_social_accounts, ai_generations_per_month, scheduled_posts_per_month, " +
    "max_active_automations, media_quota_bytes, generated_asset_quota_bytes"

export async function getWorkspaceEntitlements(workspaceId: string): Promise<WorkspaceEntitlements> {
    const admin = createAdminClient()

    const [subscriptionResult, entitlementResult] = await Promise.all([
        admin
            .from("workspace_subscriptions")
            .select(SUBSCRIPTION_SELECT)
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
        admin
            .from("workspace_entitlements")
            .select(ENTITLEMENT_SELECT)
            .eq("workspace_id", workspaceId)
            .maybeSingle(),
    ])

    if (subscriptionResult.error || entitlementResult.error) {
        console.error(
            "[billing] failed to load workspace entitlements",
            redactSensitiveLogValue(subscriptionResult.error || entitlementResult.error),
        )
        return FREE_DEFAULTS
    }

    return resolveWorkspaceEntitlementsFromRows(
        subscriptionResult.data as SubscriptionRow | null,
        entitlementResult.data as EntitlementRow | null,
    )
}

export type EntitlementFeature = "developer_api" | "deep_trend_reports"

export type EntitlementLimit =
    | "team_seats"
    | "social_accounts"
    | "ai_generations_per_month"
    | "scheduled_posts_per_month"
    | "active_automations"
    | "media_quota_bytes"
    | "generated_asset_quota_bytes"

const LIMIT_ACCESSORS: Record<EntitlementLimit, (limits: PlanLimits) => number> = {
    team_seats: (l) => l.maxTeamSeats,
    social_accounts: (l) => l.maxSocialAccounts,
    ai_generations_per_month: (l) => l.aiGenerationsPerMonth,
    scheduled_posts_per_month: (l) => l.scheduledPostsPerMonth,
    active_automations: (l) => l.maxActiveAutomations,
    media_quota_bytes: (l) => l.mediaQuotaBytes,
    generated_asset_quota_bytes: (l) => l.generatedAssetQuotaBytes,
}

export type EntitlementDecision = {
    allowed: boolean
    /** Whether the decision was actually applied (enforce mode) or advisory. */
    enforced: boolean
    mode: BillingEnforcementMode
    tier: PlanTier
    reason: "enforcement_off" | "allowed" | "plan_feature_required" | "plan_limit_reached"
}

function applyEnforcementMode(
    mode: BillingEnforcementMode,
    wouldAllow: boolean,
    tier: PlanTier,
    denyReason: "plan_feature_required" | "plan_limit_reached",
    context: string,
): EntitlementDecision {
    if (wouldAllow) {
        return { allowed: true, enforced: mode === "enforce", mode, tier, reason: "allowed" }
    }
    if (mode === "enforce") {
        return { allowed: false, enforced: true, mode, tier, reason: denyReason }
    }
    console.warn(`[billing] would deny (${mode} mode): ${context} tier=${tier} reason=${denyReason}`)
    return { allowed: true, enforced: false, mode, tier, reason: denyReason }
}

/**
 * User-scoped workspace-count gate. Subscriptions are per workspace, so the
 * number of workspaces a user may own is derived from the best plan across
 * the workspaces they already own (free owners get the free allowance).
 * Availability wins on read errors: workspace creation is never blocked by a
 * transient billing read failure.
 */
export async function checkUserWorkspaceLimit(userId: string): Promise<EntitlementDecision> {
    const mode = getBillingEnforcementMode()
    if (mode === "off") {
        return { allowed: true, enforced: false, mode, tier: "free", reason: "enforcement_off" }
    }

    const admin = createAdminClient()
    const { data: owned, error: ownedError } = await admin
        .from("workspaces")
        .select("id")
        .eq("owner_id", userId)

    if (ownedError) {
        console.error("[billing] failed to count owned workspaces", redactSensitiveLogValue(ownedError))
        return { allowed: true, enforced: false, mode, tier: "free", reason: "allowed" }
    }

    const workspaceIds = (owned ?? []).map((row) => row.id as string)
    let maxWorkspaces = PLAN_LIMITS.free.maxWorkspaces
    let bestTier: PlanTier = "free"

    if (workspaceIds.length > 0) {
        const [subscriptions, entitlements] = await Promise.all([
            admin
                .from("workspace_subscriptions")
                .select(`workspace_id, ${SUBSCRIPTION_SELECT}`)
                .in("workspace_id", workspaceIds),
            admin
                .from("workspace_entitlements")
                .select(`workspace_id, ${ENTITLEMENT_SELECT}`)
                .in("workspace_id", workspaceIds),
        ])

        if (subscriptions.error || entitlements.error) {
            console.error(
                "[billing] failed to load owned workspace plans",
                redactSensitiveLogValue(subscriptions.error || entitlements.error),
            )
            return { allowed: true, enforced: false, mode, tier: "free", reason: "allowed" }
        }

        const subscriptionByWorkspace = new Map(
            (subscriptions.data ?? []).map((row) => [row.workspace_id as string, row as unknown as SubscriptionRow]),
        )
        const entitlementByWorkspace = new Map(
            (entitlements.data ?? []).map((row) => [row.workspace_id as string, row as unknown as EntitlementRow]),
        )

        for (const workspaceId of workspaceIds) {
            const resolved = resolveWorkspaceEntitlementsFromRows(
                subscriptionByWorkspace.get(workspaceId) ?? null,
                entitlementByWorkspace.get(workspaceId) ?? null,
            )
            if (resolved.limits.maxWorkspaces > maxWorkspaces) {
                maxWorkspaces = resolved.limits.maxWorkspaces
                bestTier = resolved.effectiveTier
            }
        }
    }

    return applyEnforcementMode(
        mode,
        workspaceIds.length < maxWorkspaces,
        bestTier,
        "plan_limit_reached",
        `limit=workspaces usage=${workspaceIds.length}/${maxWorkspaces} user=${userId}`,
    )
}

/** Boolean feature gate (Developer API, deep trend reports). */
export async function checkWorkspaceFeature(
    workspaceId: string,
    feature: EntitlementFeature,
): Promise<EntitlementDecision> {
    const mode = getBillingEnforcementMode()
    if (mode === "off") {
        return { allowed: true, enforced: false, mode, tier: "free", reason: "enforcement_off" }
    }

    const entitlements = await getWorkspaceEntitlements(workspaceId)
    const wouldAllow = feature === "developer_api"
        ? entitlements.limits.developerApiEnabled
        : entitlements.limits.deepTrendReportsEnabled

    return applyEnforcementMode(
        mode,
        wouldAllow,
        entitlements.effectiveTier,
        "plan_feature_required",
        `feature=${feature} workspace=${workspaceId}`,
    )
}

/**
 * Numeric limit gate; callers pass the current usage, or a lazy getter so the
 * usage query is skipped entirely while enforcement mode is "off".
 */
export async function checkWorkspaceLimit(
    workspaceId: string,
    limit: EntitlementLimit,
    currentUsage: number | (() => Promise<number>),
): Promise<EntitlementDecision> {
    const mode = getBillingEnforcementMode()
    if (mode === "off") {
        return { allowed: true, enforced: false, mode, tier: "free", reason: "enforcement_off" }
    }

    const entitlements = await getWorkspaceEntitlements(workspaceId)
    const maxAllowed = LIMIT_ACCESSORS[limit](entitlements.limits)
    const usage = typeof currentUsage === "function" ? await currentUsage() : currentUsage

    return applyEnforcementMode(
        mode,
        usage < maxAllowed,
        entitlements.effectiveTier,
        "plan_limit_reached",
        `limit=${limit} usage=${usage}/${maxAllowed} workspace=${workspaceId}`,
    )
}
