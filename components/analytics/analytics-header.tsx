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
                background: 'rgba(139,92,246,0.16)',
                border: '1px solid rgba(139,92,246,0.28)',
                color: '#c4b5fd',
            },
        },
        {
            value: 'instagram',
            label: 'Instagram',
            icon: Instagram,
            activeStyle: {
                background: 'linear-gradient(135deg, rgba(236,72,153,0.18), rgba(139,92,246,0.18))',
                border: '1px solid rgba(236,72,153,0.22)',
                color: '#f9a8d4',
            },
        },
        {
            value: 'facebook',
            label: 'Facebook',
            icon: Facebook,
            activeStyle: {
                background: 'rgba(59,130,246,0.14)',
                border: '1px solid rgba(59,130,246,0.22)',
                color: '#93c5fd',
            },
        },
    ]

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Title */}
            <div className="space-y-3">
                <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                    Analytics
                </h1>
                <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
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
                                    background: '#12111e',
                                    border: '1px solid rgba(255,255,255,0.08)',
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
                            background: '#12111e',
                            border: '1px solid rgba(139,92,246,0.2)',
                            color: 'rgba(255,255,255,0.7)',
                        }}
                    >
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                        style={{
                            background: '#12111e',
                            border: '1px solid rgba(139,92,246,0.25)',
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
                        background: '#12111e',
                        border: '1px solid rgba(255,255,255,0.08)',
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
                                          background: 'rgba(139,92,246,0.2)',
                                          color: '#a78bfa',
                                          border: '1px solid rgba(139,92,246,0.3)',
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
                        disabled={isSyncing}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150 disabled:opacity-50"
                        style={{
                            background: '#12111e',
                            border: '1px solid rgba(255,255,255,0.08)',
                            color: 'rgba(255,255,255,0.5)',
                        }}
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                        {isSyncing ? 'Syncing…' : 'Sync'}
                    </button>
                )}

                {/* Export button */}
                <button
                    onClick={onExport}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150"
                    style={{
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(139,92,246,0.25)',
                        color: '#a78bfa',
                    }}
                >
                    <Download className="h-3.5 w-3.5" />
                    Export
                </button>
            </div>
        </div>
    )
}
