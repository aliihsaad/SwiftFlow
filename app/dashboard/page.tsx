import { formatDistanceToNow } from "date-fns"
import { redirect } from "next/navigation"

import { OverviewCommandCenter } from "@/components/dashboard/overview-command-center"
import type { RecentAction } from "@/components/dashboard/recent-activity-dropdown"
import { isReviewPhase1Release } from "@/lib/release-channel"
import { getActiveWorkspace } from "@/lib/workspace-utils"
import { createClient } from "@/utils/supabase/server"

type SocialAccountSummary = {
    platform: string
    account_name: string
}

type AutomationRunSummary = {
    id: string
    status: string
    trigger_type: string | null
    error_message: string | null
    created_at: string
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const activeWorkspace = await getActiveWorkspace()

    if (!activeWorkspace) {
        redirect("/dashboard/onboarding")
    }

    const workspaceId = activeWorkspace.id
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [
        socialAccountsResult,
        totalAutomationsResult,
        activeAutomationsResult,
        runsTodayResult,
        failedRunsResult,
        recentRunsResult,
    ] = await Promise.all([
        supabase
            .from("social_accounts")
            .select("platform, account_name")
            .eq("workspace_id", workspaceId),
        supabase
            .from("automations")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId),
        supabase
            .from("automations")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("is_active", true),
        supabase
            .from("automation_runs")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .gte("created_at", todayStart.toISOString()),
        supabase
            .from("automation_runs")
            .select("*", { count: "exact", head: true })
            .eq("workspace_id", workspaceId)
            .eq("status", "failed")
            .gte("created_at", todayStart.toISOString()),
        supabase
            .from("automation_runs")
            .select("id, status, trigger_type, error_message, created_at")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: false })
            .limit(8),
    ])

    const socialAccounts = (socialAccountsResult.data || []) as SocialAccountSummary[]
    const instagramAccount = socialAccounts.find((account) => account.platform === "instagram") || null
    const facebookAccount = socialAccounts.find((account) => account.platform === "facebook") || null
    const recentRuns = (recentRunsResult.data || []) as AutomationRunSummary[]
    const recentActivities = recentRuns.map(buildRecentActivity)
    const latestFailure = recentRuns.find((run) => run.status === "failed")?.error_message || null

    return (
        <div className="animate-in fade-in duration-500">
            <OverviewCommandCenter
                workspaceName={activeWorkspace.name}
                counts={{
                    activeAutomations: activeAutomationsResult.count || 0,
                    totalAutomations: totalAutomationsResult.count || 0,
                    runsToday: runsTodayResult.count || 0,
                    failedRuns: failedRunsResult.count || 0,
                }}
                connections={{
                    instagramName: instagramAccount?.account_name || null,
                    facebookName: facebookAccount?.account_name || null,
                    automationReady: Boolean(instagramAccount),
                }}
                latestFailure={latestFailure}
                activities={recentActivities}
                isReviewPhase1Release={isReviewPhase1Release()}
            />
        </div>
    )
}

function buildRecentActivity(run: AutomationRunSummary): RecentAction {
    const type = run.status === "failed"
        ? "automation_failed"
        : run.status === "completed"
            ? "automation_completed"
            : "automation_started"

    const trigger = run.trigger_type
        ? run.trigger_type.replaceAll("_", " ")
        : "provider event"

    return {
        id: run.id,
        type,
        description: run.status === "failed"
            ? run.error_message || "An automation run needs attention"
            : run.status === "completed"
                ? "Automation completed for " + trigger
                : "Automation started from " + trigger,
        timestamp: formatDistanceToNow(new Date(run.created_at), { addSuffix: true }),
    }
}
