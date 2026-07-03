import { NextResponse } from "next/server"
import { createAdminClient } from "@/utils/supabase/admin"
import {
    checkWorkspaceFeature,
    checkWorkspaceLimit,
    getBillingEnforcementMode,
    type EntitlementFeature,
    type EntitlementLimit,
} from "./entitlements"
import { getWorkspaceUsage } from "./usage"

/**
 * Route-level entitlement gates. Return null when the action may proceed, or
 * a 402 response when BILLING_ENFORCEMENT_MODE=enforce denies it. With the
 * default mode ("off") these are no-ops, so wiring them into routes does not
 * change current behavior.
 */

function planRequiredResponse(reason: string, tier: string): NextResponse {
    return NextResponse.json(
        {
            error: "This action is not available on the current plan",
            code: reason,
            plan_tier: tier,
        },
        { status: 402 },
    )
}

export async function gateWorkspaceFeature(
    workspaceId: string,
    feature: EntitlementFeature,
): Promise<NextResponse | null> {
    const decision = await checkWorkspaceFeature(workspaceId, feature)
    if (decision.allowed) return null
    return planRequiredResponse(decision.reason, decision.tier)
}

export async function gateWorkspaceLimit(
    workspaceId: string,
    limit: EntitlementLimit,
    currentUsage: number | (() => Promise<number>),
): Promise<NextResponse | null> {
    const decision = await checkWorkspaceLimit(workspaceId, limit, currentUsage)
    if (decision.allowed) return null
    return planRequiredResponse(decision.reason, decision.tier)
}

/**
 * AI generation quota gate with BYOK awareness: workspaces that configured
 * their own AI provider key (Gemini/OpenAI/OpenRouter in workspace_settings)
 * pay for their own AI usage, so the monthly plan quota only applies to
 * workspaces running on the platform's fallback key.
 */
export async function gateAiGeneration(workspaceId: string): Promise<NextResponse | null> {
    if (getBillingEnforcementMode() === "off") return null

    const admin = createAdminClient()
    const { data: settings } = await admin
        .from("workspace_settings")
        .select("gemini_api_key, openai_api_key, openrouter_api_key")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    const usesOwnKey = Boolean(
        settings?.gemini_api_key || settings?.openai_api_key || settings?.openrouter_api_key,
    )
    if (usesOwnKey) return null

    return gateWorkspaceLimit(
        workspaceId,
        "ai_generations_per_month",
        () => getWorkspaceUsage(admin, workspaceId, "ai_generations"),
    )
}
