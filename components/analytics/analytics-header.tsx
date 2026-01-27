"use client"

import { DateRange, Granularity } from "@/types/analytics"
import { Button } from "@/components/ui/button"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Download, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalyticsHeaderProps {
    dateRange: DateRange
    granularity: Granularity
    onDateRangeChange: (range: DateRange) => void
    onGranularityChange: (granularity: Granularity) => void
    onExport: () => void
    onSync?: () => void
    isSyncing?: boolean
}

export function AnalyticsHeader({
    dateRange,
    granularity,
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

    return (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Title section */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
                <p className="text-muted-foreground mt-1">
                    Track your social media growth and engagement
                </p>
            </div>

            {/* Controls section */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Date range selector */}
                <Select value={dateRange} onValueChange={(value) => onDateRangeChange(value as DateRange)}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="last_7_days">Last 7 days</SelectItem>
                        <SelectItem value="last_30_days">Last 30 days</SelectItem>
                        <SelectItem value="last_90_days">Last 90 days</SelectItem>
                    </SelectContent>
                </Select>

                {/* Granularity toggle */}
                <div className="flex items-center rounded-md border border-border bg-background p-1">
                    {granularityOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => onGranularityChange(option.value)}
                            className={cn(
                                "px-3 py-1.5 text-sm font-medium rounded transition-colors",
                                granularity === option.value
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>

                {/* Sync button */}
                {onSync && (
                    <Button
                        onClick={onSync}
                        variant="outline"
                        size="sm"
                        disabled={isSyncing}
                    >
                        <RefreshCw className={cn("mr-2 h-4 w-4", isSyncing && "animate-spin")} />
                        {isSyncing ? 'Syncing...' : 'Sync'}
                    </Button>
                )}

                {/* Export button */}
                <Button onClick={onExport} variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </div>
        </div>
    )
}
