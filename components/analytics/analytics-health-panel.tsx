"use client"

import Link from "next/link"
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    LoaderCircle,
    RefreshCw,
} from "lucide-react"
import type { AnalyticsMetricStatus, AnalyticsPlatformStatus } from "@/types/analytics"

export type AnalyticsSyncFeedback = {
    tone: "success" | "warning" | "error"
    title: string
    message: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
}

type AnalyticsHealthPanelProps = {
    platformStatuses: AnalyticsPlatformStatus[]
    warnings: string[]
    suspectedMissingPermissions: string[]
    reason?: string | null
    feedback?: AnalyticsSyncFeedback | null
    isSyncing: boolean
    canSync: boolean
    onSync: () => void
}

const statusLabel: Record<AnalyticsMetricStatus, string> = {
    available: "Available",
    partial: "Partial",
    unavailable: "Unavailable",
}

function StatusBadge({ label, status }: { label: string; status: AnalyticsMetricStatus }) {
    const tone = status === "available"
        ? "border-emerald-300/15 bg-emerald-400/[0.07] text-emerald-200"
        : status === "partial"
            ? "border-amber-300/15 bg-amber-400/[0.07] text-amber-200"
            : "border-white/[0.08] bg-white/[0.035] text-white/42"

    return (
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold ${tone}`}>
            {status === "available" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {label}: {statusLabel[status]}
        </span>
    )
}

export function AnalyticsHealthPanel({
    platformStatuses,
    warnings,
    suspectedMissingPermissions,
    reason,
    feedback,
    isSyncing,
    canSync,
    onSync,
}: AnalyticsHealthPanelProps) {
    const status = platformStatuses.find((item) => item.platform === "instagram")
    const missingPermissions = Array.from(new Set([
        ...(status?.missingPermissions || []),
        ...suspectedMissingPermissions,
        ...(feedback?.missingPermissions || []),
    ]))
    const noAccount = reason === "no_connected_accounts" || reason === "no_connected_accounts_for_platform" || !status
    const requiresReconnect = feedback?.requiresReconnect === true
        || missingPermissions.includes("instagram_business_manage_insights")
    const noPostsInRange = reason === "no_published_posts_in_range"
    const healthy = status?.status === "available" && !requiresReconnect

    const title = noAccount
        ? "Connect Instagram to start collecting analytics"
        : requiresReconnect
            ? "Reconnect Instagram to restore insight access"
            : noPostsInRange
                ? "No posts were published in this range"
                : healthy
                    ? "Instagram analytics are up to date"
                    : "Some analytics are still filling in"

    const description = noAccount
        ? "A Business or Creator account is required."
        : requiresReconnect
            ? "The saved token does not include the insights permission."
            : noPostsInRange
                ? "Try a wider date range; account trends remain available."
                : healthy
                    ? "Account and post metrics are available from the latest saved sync."
                    : warnings[0] || "Sync again to refresh missing metrics."

    const tone = requiresReconnect
        ? "border-amber-300/18 bg-amber-400/[0.05]"
        : healthy
            ? "border-emerald-300/15 bg-emerald-400/[0.045]"
            : "border-white/[0.08] bg-white/[0.025]"

    return (
        <section className={`overflow-hidden rounded-[18px] border ${tone}`} aria-live="polite">
            <div className="flex flex-col gap-4 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between lg:px-5">
                <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        requiresReconnect ? "bg-amber-400/10 text-amber-200" : healthy ? "bg-emerald-400/10 text-emerald-200" : "bg-white/[0.05] text-white/45"
                    }`}>
                        {requiresReconnect ? <AlertTriangle className="h-4 w-4" /> : healthy ? <CheckCircle2 className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-white/82">{title}</h2>
                        <p className="mt-0.5 text-xs leading-5 text-white/38">{description}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {status ? <StatusBadge label="Account" status={status.accountMetricsStatus} /> : null}
                    {status ? <StatusBadge label="Posts" status={status.postMetricsStatus} /> : null}
                    {(noAccount || requiresReconnect || status?.exactScopesKnown === false) ? (
                        <Link
                            href="/dashboard/onboarding/instagram"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-linear-to-r from-fuchsia-500 to-cyan-400 px-3 text-[11px] font-semibold text-slate-950 transition hover:brightness-110"
                        >
                            {noAccount ? "Connect" : "Reconnect"}
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    ) : null}
                    {!healthy && !noAccount && !requiresReconnect ? (
                        <button
                            type="button"
                            onClick={onSync}
                            disabled={!canSync || isSyncing}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-[11px] font-semibold text-white/65 disabled:opacity-40"
                        >
                            {isSyncing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Refresh
                        </button>
                    ) : null}
                </div>
            </div>

            {feedback ? (
                <div className={`border-t px-5 py-2.5 text-xs ${
                    feedback.tone === "error" ? "border-rose-300/15 text-rose-100/75" : feedback.tone === "warning" ? "border-amber-300/15 text-amber-100/75" : "border-emerald-300/15 text-emerald-100/75"
                }`}>
                    <span className="font-semibold">{feedback.title}.</span> <span className="text-white/45">{feedback.message}</span>
                </div>
            ) : null}

            {(warnings.length > 1 || missingPermissions.length > 0) ? (
                <details className="border-t border-white/[0.06] px-5 py-2.5 text-xs text-white/38">
                    <summary className="cursor-pointer text-white/48">Data details</summary>
                    <div className="mt-2 space-y-1.5">
                        {warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        {missingPermissions.length > 0 ? <p>Permission: {missingPermissions.join(", ")}</p> : null}
                    </div>
                </details>
            ) : null}
        </section>
    )
}
