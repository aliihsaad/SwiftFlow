"use client"

import {
    CalendarRange,
    Download,
    Instagram,
    RefreshCw,
    TrendingUp,
} from "lucide-react"

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { DateRange, Granularity } from "@/types/analytics"

interface AnalyticsHeaderProps {
    dateRange: DateRange
    granularity: Granularity
    onDateRangeChange: (range: DateRange) => void
    onGranularityChange: (granularity: Granularity) => void
    onExport: () => void
    onSync?: () => void
    isSyncing?: boolean
    syncDisabled?: boolean
    syncDisabledReason?: string
    postsInRange?: number
    metricsCoveragePct?: number
    lastSyncedAt?: string | null
}

const granularityOptions: Array<{ value: Granularity; label: string }> = [
    { value: "daily", label: "Daily" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
]

function formatLastSync(value?: string | null): string {
    if (!value) return "Not synced yet"
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return "Sync time unavailable"
    return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(date)
}

export function AnalyticsHeader({
    dateRange,
    granularity,
    onDateRangeChange,
    onGranularityChange,
    onExport,
    onSync,
    isSyncing = false,
    syncDisabled = false,
    syncDisabledReason,
    postsInRange,
    metricsCoveragePct,
    lastSyncedAt,
}: AnalyticsHeaderProps) {
    return (
        <header className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-[#10131d] shadow-[0_20px_60px_rgba(2,4,12,0.24)]">
            <div className="relative flex flex-col gap-5 p-5 sm:p-6 xl:flex-row xl:items-center xl:justify-between">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(139,92,246,0.16),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(34,211,238,0.1),transparent_32%)]" />
                <div className="relative min-w-0">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-100/55">
                        <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                        Instagram performance
                    </div>
                    <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-[30px]">
                        Analytics
                    </h1>
                    <p className="mt-1 max-w-xl text-sm text-white/42">
                        Understand audience growth and find the content creating real engagement.
                    </p>
                </div>

                <div className="relative flex flex-wrap gap-2">
                    {onSync ? (
                        <button
                            type="button"
                            onClick={onSync}
                            disabled={isSyncing || syncDisabled}
                            title={syncDisabledReason}
                            className="inline-flex h-10 items-center gap-2 rounded-xl bg-linear-to-r from-cyan-400 to-violet-500 px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} aria-hidden="true" />
                            {isSyncing ? "Syncing" : "Sync data"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={onExport}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.05] px-4 text-sm font-semibold text-white/70 transition hover:bg-white/[0.09] hover:text-white"
                    >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        Export
                    </button>
                </div>
            </div>

            <div className="grid border-t border-white/[0.06] bg-black/10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="grid grid-cols-3 divide-x divide-white/[0.06] border-b border-white/[0.06] lg:border-b-0">
                    <HeaderMetric label="Posts in range" value={postsInRange == null ? "—" : String(postsInRange)} />
                    <HeaderMetric label="Metric coverage" value={metricsCoveragePct == null ? "—" : `${metricsCoveragePct}%`} />
                    <HeaderMetric label="Last sync" value={formatLastSync(lastSyncedAt)} compact />
                </div>

                <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:p-4">
                    <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRange)}>
                        <SelectTrigger className="h-10 w-full border-white/[0.08] bg-white/[0.04] text-sm text-white/72 sm:w-[156px]">
                            <CalendarRange className="mr-2 h-4 w-4 text-white/35" aria-hidden="true" />
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
                                    "min-h-8 flex-1 rounded-lg px-3 text-[11px] font-semibold transition sm:min-w-[64px]",
                                    granularity === option.value
                                        ? "bg-white/[0.09] text-white"
                                        : "text-white/32 hover:text-white/65",
                                )}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </header>
    )
}

function HeaderMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
    return (
        <div className="min-w-0 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/28">
                {label === "Posts in range" ? <Instagram className="h-3 w-3" aria-hidden="true" /> : null}
                {label}
            </div>
            <p className={cn("mt-1.5 truncate font-semibold text-white/78", compact ? "text-xs" : "text-lg tabular-nums")} title={value}>
                {value}
            </p>
        </div>
    )
}
