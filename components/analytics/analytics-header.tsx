"use client"

import {
    BarChart3,
    CalendarRange,
    Download,
    Facebook,
    Gauge,
    Instagram,
    Layers3,
    RefreshCw,
    Sparkles,
} from "lucide-react"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { AnalyticsPlatformView, DateRange, Granularity } from "@/types/analytics"

interface AnalyticsHeaderProps {
    platformView: AnalyticsPlatformView
    dateRange: DateRange
    granularity: Granularity
    onPlatformViewChange: (platform: AnalyticsPlatformView) => void
    onDateRangeChange: (range: DateRange) => void
    onGranularityChange: (granularity: Granularity) => void
    onExport: () => void
    onSync?: () => void
    isSyncing?: boolean
    syncDisabled?: boolean
    syncDisabledReason?: string
}

const platformOptions: Array<{
    value: AnalyticsPlatformView
    label: string
    icon: typeof Layers3
    tone: "violet" | "pink" | "cyan"
}> = [
    { value: "all", label: "Combined", icon: Layers3, tone: "violet" },
    { value: "instagram", label: "Instagram", icon: Instagram, tone: "pink" },
    { value: "facebook", label: "Facebook", icon: Facebook, tone: "cyan" },
]

const granularityOptions: Array<{ value: Granularity; label: string }> = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
]

const rangeLabels: Record<DateRange, string> = {
    last_7_days: "Last 7 days",
    last_30_days: "Last 30 days",
    last_90_days: "Last 90 days",
}

export function AnalyticsHeader({
    platformView,
    dateRange,
    granularity,
    onPlatformViewChange,
    onDateRangeChange,
    onGranularityChange,
    onExport,
    onSync,
    isSyncing = false,
    syncDisabled = false,
    syncDisabledReason,
}: AnalyticsHeaderProps) {
    const platformLabel = platformOptions.find((option) => option.value === platformView)?.label || "Combined"

    return (
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#10131e] shadow-[0_28px_90px_rgba(2,4,12,0.34)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(139,92,246,0.19),transparent_36%),radial-gradient(circle_at_92%_8%,rgba(34,211,238,0.14),transparent_34%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-violet-200/45 to-transparent" />

            <div className="relative grid gap-7 p-5 sm:p-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)] xl:p-8">
                <div className="flex min-w-0 flex-col justify-between gap-8">
                    <div>
                        <span className="sf-kicker">
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Performance intelligence
                        </span>
                        <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-4xl xl:text-[46px] xl:leading-[1.03]">
                            See what is growing.
                            <span className="block bg-linear-to-r from-violet-200 via-white to-cyan-200 bg-clip-text text-transparent">
                                Know what to do next.
                            </span>
                        </h1>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-white/48 sm:text-[15px]">
                            Turn provider metrics into a focused performance view, with capability status and content intelligence kept beside the numbers they explain.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {onSync ? (
                            <button
                                type="button"
                                onClick={onSync}
                                disabled={isSyncing || syncDisabled}
                                title={syncDisabledReason}
                                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-cyan-200/20 bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 shadow-[0_12px_32px_rgba(34,211,238,0.16)] transition hover:-translate-y-0.5 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} aria-hidden="true" />
                                {isSyncing ? "Syncing metrics" : syncDisabled ? "Sync requires admin" : "Sync analytics"}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            onClick={onExport}
                            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.055] px-4 text-sm font-semibold text-white/74 transition hover:bg-white/[0.085] hover:text-white"
                        >
                            <Download className="h-4 w-4 text-pink-200" aria-hidden="true" />
                            Export current view
                        </button>
                    </div>
                </div>

                <div className="rounded-[22px] border border-white/[0.075] bg-black/20 p-4 backdrop-blur-sm sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/30">Analysis lens</p>
                            <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white">{platformLabel}</p>
                            <p className="mt-1 text-xs text-white/35">{rangeLabels[dateRange]} · {granularity} resolution</p>
                        </div>
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-200/12 bg-violet-300/[0.07] text-violet-100/65">
                            <Gauge className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                    </div>

                    <div className="mt-6 grid grid-cols-3 gap-2">
                        <LensMetric icon={Layers3} label="Source" value={platformView === "all" ? "All" : platformView === "instagram" ? "IG" : "FB"} />
                        <LensMetric icon={CalendarRange} label="Window" value={dateRange === "last_7_days" ? "7d" : dateRange === "last_30_days" ? "30d" : "90d"} />
                        <LensMetric icon={BarChart3} label="Grain" value={granularity.slice(0, 1).toUpperCase()} />
                    </div>
                </div>
            </div>

            <div className="relative border-t border-white/[0.06] bg-black/10 p-4 sm:px-6 sm:py-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="inline-flex w-full rounded-2xl border border-white/[0.07] bg-black/20 p-1 xl:w-auto" aria-label="Analytics platform">
                        {platformOptions.map((option) => {
                            const Icon = option.icon
                            const active = platformView === option.value
                            return (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onPlatformViewChange(option.value)}
                                    aria-pressed={active}
                                    className={cn(
                                        "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition sm:min-w-32",
                                        active
                                            ? option.tone === "pink"
                                                ? "border-pink-200/15 bg-pink-300/[0.09] text-pink-100"
                                                : option.tone === "cyan"
                                                    ? "border-cyan-200/15 bg-cyan-300/[0.09] text-cyan-100"
                                                    : "border-violet-200/15 bg-violet-300/[0.09] text-violet-100"
                                            : "border-transparent text-white/36 hover:bg-white/[0.04] hover:text-white/65",
                                    )}
                                >
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {option.label}
                                </button>
                            )
                        })}
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRange)}>
                            <SelectTrigger className="h-11 w-full border-white/[0.08] bg-white/[0.035] text-sm text-white/68 sm:w-[170px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-white/[0.08] bg-[#151925] text-white/75">
                                <SelectItem value="last_7_days">Last 7 days</SelectItem>
                                <SelectItem value="last_30_days">Last 30 days</SelectItem>
                                <SelectItem value="last_90_days">Last 90 days</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
                            {granularityOptions.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => onGranularityChange(option.value)}
                                    aria-pressed={granularity === option.value}
                                    className={cn(
                                        "min-h-9 flex-1 rounded-lg px-3 text-[11px] font-semibold transition sm:min-w-[70px]",
                                        granularity === option.value
                                            ? "border border-white/[0.09] bg-white/[0.07] text-white/72"
                                            : "border border-transparent text-white/28 hover:text-white/55",
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function LensMetric({ icon: Icon, label, value }: { icon: typeof Layers3; label: string; value: string }) {
    return (
        <div className="rounded-xl border border-white/[0.055] bg-white/[0.026] px-2 py-3 text-center">
            <Icon className="mx-auto h-3.5 w-3.5 text-white/28" aria-hidden="true" />
            <p className="mt-2 text-base font-semibold text-white/80">{value}</p>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/24">{label}</p>
        </div>
    )
}
