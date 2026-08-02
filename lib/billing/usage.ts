import type { SupabaseClient } from "@supabase/supabase-js"
import { redactSensitiveLogValue } from "@/lib/security/redaction"

export type UsageMetric = "ai_generations"

export function currentUsagePeriodStart(now: Date = new Date()): string {
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, "0")
    return year + "-" + month + "-01"
}

export async function incrementWorkspaceUsage(
    admin: SupabaseClient,
    workspaceId: string,
    metric: UsageMetric,
    amount = 1,
): Promise<void> {
    try {
        const { error } = await admin.rpc("increment_workspace_usage", {
            p_workspace_id: workspaceId,
            p_metric: metric,
            p_period_start: currentUsagePeriodStart(),
            p_amount: Math.max(0, Math.round(amount)),
        })

        if (error) {
            console.error("[billing] failed to increment usage counter", redactSensitiveLogValue(error))
        }
    } catch (error) {
        console.error("[billing] failed to increment usage counter", redactSensitiveLogValue(error))
    }
}

export async function getWorkspaceUsage(
    admin: SupabaseClient,
    workspaceId: string,
    metric: UsageMetric,
): Promise<number> {
    const { data, error } = await admin
        .from("workspace_usage_counters")
        .select("used")
        .eq("workspace_id", workspaceId)
        .eq("metric", metric)
        .eq("period_start", currentUsagePeriodStart())
        .maybeSingle()

    if (error) {
        console.error("[billing] failed to read usage counter", redactSensitiveLogValue(error))
        return 0
    }
    return Number(data?.used ?? 0)
}
