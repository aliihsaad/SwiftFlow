"use client"

import { CSSProperties } from "react"
import { AnalyticsPlatformView, DateRange, Granularity } from "@/types/analytics"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Download, Facebook, Instagram, Layers3, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

const ANALYTICS_THEME = {
    panel: "#151620",
    panelAlt: "#10111a",
    border: "rgba(255,255,255,0.08)",
    text: "rgba(255,255,255,0.9)",
    textMuted: "rgba(255,255,255,0.42)",
    amber: "#f59e0b",
    cyan: "#22d3ee",
    coral: "#fb7185",
}

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
    const granularityOptions: { value: Granularity; label: string }[] = [
        { value: 'daily', label: 'Daily' },
        { value: 'weekly', label: 'Weekly' },
        { value: 'monthly', label: 'Monthly' },
    ]

    const platformTabs: Array<{
        value: AnalyticsPlatformView
        label: string
        icon: typeof Layers3
        activeStyle: CSSProperties
    }> = [
        {
            value: 'all',
            label: 'All',
            icon: Layers3,
            activeStyle: {
                background: 'rgba(245,158,11,0.12)',
                border: '1px solid rgba(245,158,11,0.2)',
                color: '#fbbf24',
            },
        },
        {
            value: 'instagram',
            label: 'Instagram',
            icon: Instagram,
            activeStyle: {
                background: 'rgba(251,113,133,0.12)',
                border: '1px solid rgba(251,113,133,0.2)',
                color: '#fda4af',
            },
        },
        {
            value: 'facebook',
            label: 'Facebook',
            icon: Facebook,
            activeStyle: {
                background: 'rgba(34,211,238,0.12)',
                border: '1px solid rgba(34,211,238,0.2)',
                color: '#67e8f9',
            },
        },
    ]

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Title */}
            <div className="space-y-3">
                <div
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                    style={{
                        background: "rgba(34,211,238,0.06)",
                        border: "1px solid rgba(34,211,238,0.14)",
                        color: "rgba(255,255,255,0.78)",
                    }}
                >
                    Analytics
                </div>
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: ANALYTICS_THEME.text }}>
                    Analytics
                </h1>
                <p className="text-sm mt-0.5" style={{ color: ANALYTICS_THEME.textMuted }}>
                    Track your social media growth and engagement
                </p>
                <div className="flex flex-wrap items-center gap-2">
                    {platformTabs.map((tab) => {
                        const isActive = platformView === tab.value
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.value}
                                type="button"
                                onClick={() => onPlatformViewChange(tab.value)}
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150"
                                style={isActive ? tab.activeStyle : {
                                    background: ANALYTICS_THEME.panelAlt,
                                    border: `1px solid ${ANALYTICS_THEME.border}`,
                                    color: 'rgba(255,255,255,0.4)',
                                }}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {tab.label}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Date range selector */}
                <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRange)}>
                    <SelectTrigger
                        className="w-[160px] border-0 text-sm font-medium"
                        style={{
                            background: ANALYTICS_THEME.panelAlt,
                            border: `1px solid ${ANALYTICS_THEME.border}`,
                            color: 'rgba(255,255,255,0.7)',
                        }}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                        style={{
                            background: ANALYTICS_THEME.panel,
                            border: `1px solid ${ANALYTICS_THEME.border}`,
                        }}
                    >
                        <SelectItem value="last_7_days">Last 7 days</SelectItem>
                        <SelectItem value="last_30_days">Last 30 days</SelectItem>
                        <SelectItem value="last_90_days">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>

                {/* Granularity toggle */}
                <div
                    className="flex items-center rounded-lg p-1"
                    style={{
                        background: ANALYTICS_THEME.panelAlt,
                        border: `1px solid ${ANALYTICS_THEME.border}`,
                    }}
                >
                    {granularityOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => onGranularityChange(option.value)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150"
                            style={
                                granularity === option.value
                                    ? {
                                          background: 'rgba(245,158,11,0.12)',
                                          color: '#fbbf24',
                                          border: '1px solid rgba(245,158,11,0.18)',
                                      }
                                    : {
                                          color: 'rgba(255,255,255,0.35)',
                                          border: '1px solid transparent',
                                      }
                            }
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {/* Sync button */}
                {onSync && (
                    <button
                        onClick={onSync}
                        disabled={isSyncing || syncDisabled}
                        title={syncDisabledReason}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150 disabled:opacity-50"
                        style={{
                            background: ANALYTICS_THEME.panelAlt,
                            border: `1px solid ${ANALYTICS_THEME.border}`,
                            color: 'rgba(255,255,255,0.5)',
                        }}
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                        {isSyncing ? 'Syncing…' : syncDisabled ? 'Sync (Admin)' : 'Sync'}
                    </button>
                )}

                {/* Export button */}
                <button
                    onClick={onExport}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150"
                    style={{
                        background: 'rgba(251,113,133,0.10)',
                        border: '1px solid rgba(251,113,133,0.2)',
                        color: '#fda4af',
                    }}
                >
                    <Download className="h-3.5 w-3.5" />
                    Export
                </button>
            </div>
        </div>
    )
}
