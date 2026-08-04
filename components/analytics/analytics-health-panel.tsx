"use client"

import Link from "next/link"
import {
    AlertTriangle,
    ArrowRight,
    CheckCircle2,
    Instagram,
    LoaderCircle,
    RefreshCw,
    ShieldCheck,
} from "lucide-react"
import type {
    AnalyticsPlatformStatus,
    AnalyticsMetricStatus,
} from "@/types/analytics"

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

const STATUS_COPY: Record<AnalyticsMetricStatus, string> = {
    available: "Live",
    partial: "Partial",
    unavailable: "Waiting",
}

function metricTone(status: AnalyticsMetricStatus): string {
    if (status === "available") return "text-emerald-300"
    if (status === "partial") return "text-amber-300"
    return "text-white/42"
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
    const relevantStatuses = platformStatuses.filter((status) => status.platform === "instagram")
    const connected = relevantStatuses.length > 0
    const isNoConnectedAccount =
        reason === "no_connected_accounts" ||
        reason === "no_connected_accounts_for_platform"
    const exactMissingPermissions = relevantStatuses.flatMap((status) => status.missingPermissions)
    const missingPermissions = Array.from(new Set([
        ...exactMissingPermissions,
        ...suspectedMissingPermissions,
        ...(feedback?.missingPermissions || []),
    ]))
    const scopesUnknown = relevantStatuses.some((status) => !status.exactScopesKnown)
    const requiresReconnect =
        feedback?.requiresReconnect === true ||
        missingPermissions.includes("instagram_business_manage_insights")
    const allLive =
        connected &&
        relevantStatuses.every((status) => status.status === "available")
    const hasSelectedRangeGap =
        reason === "no_published_posts" ||
        reason === "no_published_posts_in_range"

    const headline = isNoConnectedAccount
        ? "Connect an account to activate analytics"
        : requiresReconnect
            ? "Reconnect Instagram to unlock insights"
            : allLive
                ? "Analytics data is healthy"
                : hasSelectedRangeGap
                    ? "Insights are connected—this range has no posts"
                    : "Analytics is connected with limited data"

    const description = isNoConnectedAccount
        ? "SwiftFlow needs a connected professional account before it can sync account and post performance."
        : requiresReconnect
            ? "Your current token predates the insights permission. Reconnecting once will attach the permission you enabled in Meta."
            : allLive
                ? "Instagram account and post metrics are available."
                : hasSelectedRangeGap
                    ? "Try a wider date range or publish new content. Account-level metrics can still continue syncing."
                    : "SwiftFlow will keep the available metrics visible while it finishes filling the remaining gaps."

    const toneClasses = requiresReconnect
        ? "border-amber-300/20 bg-amber-400/[0.06]"
        : allLive
            ? "border-emerald-300/20 bg-emerald-400/[0.055]"
            : "border-cyan-300/18 bg-cyan-400/[0.045]"

    return (
        <section
            className={`overflow-hidden rounded-[24px] border ${toneClasses}`}
            aria-labelledby="analytics-health-title"
            aria-live="polite"
        >
            <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:p-6">
                <div className="flex min-w-0 items-start gap-3.5">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                        requiresReconnect
                            ? "border-amber-300/20 bg-amber-400/10 text-amber-200"
                            : allLive
                                ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200"
                                : "border-cyan-300/20 bg-cyan-400/10 text-cyan-200"
                    }`}>
                        {requiresReconnect ? (
                            <AlertTriangle className="h-5 w-5" />
                        ) : allLive ? (
                            <ShieldCheck className="h-5 w-5" />
                        ) : (
                            <RefreshCw className="h-5 w-5" />
                        )}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
                            Data health
                        </p>
                        <h2 id="analytics-health-title" className="mt-1 text-base font-semibold text-white/92">
                            {headline}
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/52">
                            {description}
                        </p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:justify-end">
                    {(isNoConnectedAccount || requiresReconnect || scopesUnknown) ? (
                        <Link
                            href="/dashboard/onboarding/instagram"
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_rgba(34,211,238,0.18)] transition hover:brightness-110"
                        >
                            {isNoConnectedAccount ? "Connect Instagram" : "Reconnect Instagram"}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    ) : null}
                    <button
                        type="button"
                        onClick={onSync}
                        disabled={!canSync || isSyncing}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
                        title={!canSync ? "Only workspace admins and owners can sync analytics." : undefined}
                    >
                        {isSyncing ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCw className="h-4 w-4" />
                        )}
                        {isSyncing ? "Syncing" : "Sync now"}
                    </button>
                </div>
            </div>

            {relevantStatuses.length > 0 ? (
                <div className="grid border-t border-white/[0.07] md:grid-cols-2">
                    {relevantStatuses.map((status, index) => {
                        return (
                            <article
                                key={status.platform}
                                className={`flex items-center gap-4 p-4 sm:p-5 ${
                                    index > 0 ? "border-t border-white/[0.07] md:border-l md:border-t-0" : ""
                                }`}
                            >
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/72">
                                    <Instagram className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-sm font-semibold capitalize text-white/86">
                                            {status.platform}
                                        </h3>
                                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${metricTone(status.status)}`}>
                                            {status.status === "available" ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                                            {STATUS_COPY[status.status]}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg bg-black/15 px-3 py-2">
                                            <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Account</span>
                                            <span className={`mt-0.5 block font-medium ${metricTone(status.accountMetricsStatus)}`}>
                                                {STATUS_COPY[status.accountMetricsStatus]}
                                            </span>
                                        </div>
                                        <div className="rounded-lg bg-black/15 px-3 py-2">
                                            <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30">Posts</span>
                                            <span className={`mt-0.5 block font-medium ${metricTone(status.postMetricsStatus)}`}>
                                                {STATUS_COPY[status.postMetricsStatus]}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        )
                    })}
                </div>
            ) : null}

            {feedback ? (
                <div className={`border-t px-5 py-3.5 text-sm ${
                    feedback.tone === "error"
                        ? "border-rose-300/15 bg-rose-400/[0.055] text-rose-100/80"
                        : feedback.tone === "warning"
                            ? "border-amber-300/15 bg-amber-400/[0.045] text-amber-100/78"
                            : "border-emerald-300/15 bg-emerald-400/[0.04] text-emerald-100/78"
                }`}>
                    <span className="font-semibold">{feedback.title}.</span>{" "}
                    <span className="text-white/55">{feedback.message}</span>
                </div>
            ) : null}

            {(warnings.length > 0 || missingPermissions.length > 0 || scopesUnknown) ? (
                <details className="border-t border-white/[0.07] px-5 py-3 text-xs text-white/42">
                    <summary className="cursor-pointer select-none font-medium text-white/55">
                        Technical details
                    </summary>
                    <div className="mt-3 space-y-1.5 leading-relaxed">
                        {warnings.slice(0, 3).map((warning) => (
                            <p key={warning}>{warning}</p>
                        ))}
                        {missingPermissions.length > 0 ? (
                            <p>
                                Permission required:{" "}
                                <code className="rounded bg-black/25 px-1.5 py-0.5 text-white/68">
                                    {missingPermissions.join(", ")}
                                </code>
                            </p>
                        ) : null}
                        {scopesUnknown ? (
                            <p>Reconnect once to store an exact permission snapshot for this account.</p>
                        ) : null}
                    </div>
                </details>
            ) : null}
        </section>
    )
}
