import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { getWorkspaceRoleForUser } from "@/lib/workspace-permissions"
import { hasWorkspacePermissionByRole } from "@/lib/workspace-rbac"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { getWorkspaceEntitlements } from "@/lib/billing/entitlements"
import { getConfiguredPriceId, isCheckoutBlockedByStatus } from "@/lib/billing/plans"
import { isStripeConfigured } from "@/lib/billing/stripe"
import { getWorkspaceUsage } from "@/lib/billing/usage"

export const runtime = "nodejs"

/**
 * Billing summary for the subscription settings UI: current plan, subscription
 * state, effective limits, and this month's usage. Read-only.
 */
export async function GET() {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        const workspace = await getActiveWorkspace()
        if (!workspace) {
            return NextResponse.json({ error: "No active workspace" }, { status: 404 })
        }

        const role = await getWorkspaceRoleForUser(supabase, user.id, workspace.id)
        const admin = createAdminClient()

        const [entitlements, subscriptionResult, settingsResult, aiUsage, scheduledUsage, mediaBytes, generatedBytes] = await Promise.all([
            getWorkspaceEntitlements(workspace.id),
            admin
                .from("workspace_subscriptions")
                .select("status, plan_tier, cancel_at_period_end, current_period_end, trial_end, downgrade_grace_until")
                .eq("workspace_id", workspace.id)
                .maybeSingle(),
            admin
                .from("workspace_settings")
                .select("gemini_api_key, openai_api_key, openrouter_api_key")
                .eq("workspace_id", workspace.id)
                .maybeSingle(),
            getWorkspaceUsage(admin, workspace.id, "ai_generations"),
            getWorkspaceUsage(admin, workspace.id, "scheduled_posts"),
            getWorkspaceUsage(admin, workspace.id, "media_upload_bytes"),
            getWorkspaceUsage(admin, workspace.id, "generated_asset_bytes"),
        ])

        const subscription = subscriptionResult.data ?? null
        const checkoutConfigured = isStripeConfigured() && Boolean(getConfiguredPriceId("pro", "month"))

        // All plans currently run AI on the workspace's own key (BYOK); the
        // AI quota only ever applies to a future platform-key offering.
        const settings = settingsResult.data
        const byokAi = Boolean(settings?.gemini_api_key || settings?.openai_api_key || settings?.openrouter_api_key)

        return NextResponse.json({
            billingAvailable: checkoutConfigured,
            byokAi,
            canManageBilling: hasWorkspacePermissionByRole(role, "billing:manage"),
            plan: {
                tier: entitlements.effectiveTier,
                source: entitlements.entitlementSource,
                status: subscription?.status ?? "none",
                cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
                currentPeriodEnd: subscription?.current_period_end ?? null,
                trialEnd: subscription?.trial_end ?? null,
                downgradeGraceUntil: subscription?.downgrade_grace_until ?? null,
                hasSubscription: Boolean(subscription),
                canStartCheckout: checkoutConfigured && !isCheckoutBlockedByStatus(subscription?.status),
            },
            limits: entitlements.limits,
            usage: {
                aiGenerations: aiUsage,
                scheduledPosts: scheduledUsage,
                mediaUploadBytes: mediaBytes,
                generatedAssetBytes: generatedBytes,
            },
        })
    } catch (error) {
        console.error("[billing] summary error:", redactSensitiveLogValue(error))
        return NextResponse.json({ error: "Failed to load billing summary" }, { status: 500 })
    }
}
