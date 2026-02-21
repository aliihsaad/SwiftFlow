"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { DateRange, Granularity, AnalyticsResponse } from "@/types/analytics"
import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { KPICards } from "@/components/analytics/kpi-cards"
import { FollowerGrowthChart } from "@/components/analytics/engagement-chart"
import { LatestPostCard } from "@/components/analytics/latest-post-card"
import { AccountAnalyticsCard } from "@/components/analytics/account-analytics-card"
import { OtherPostsList } from "@/components/analytics/other-posts-list"
import { AnalyticsLoadingSkeleton } from "@/components/analytics/analytics-loading"
import { useToast } from "@/components/ui/use-toast"

const fetcher = async (url: string) => {
    const res = await fetch(url, { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(payload?.error || "Failed to fetch analytics")
    }
    return payload
}

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState<DateRange>('last_7_days')
    const [granularity, setGranularity] = useState<Granularity>('daily')
    const [isSyncing, setIsSyncing] = useState(false)
    const [initialSyncDone, setInitialSyncDone] = useState(false)
    const { toast } = useToast()

    // Fetch analytics data
    const { data, error, isLoading, mutate } = useSWR<AnalyticsResponse>(
        initialSyncDone ? `/api/analytics?range=${dateRange}&granularity=${granularity}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
        }
    )

    // Auto-sync analytics on page load (since cron is not available)
    const hasSynced = useRef(false)
    useEffect(() => {
        if (hasSynced.current) return
        hasSynced.current = true

        const autoSync = async () => {
            setIsSyncing(true)
            try {
                const response = await fetch('/api/sync-analytics', { method: 'POST' })
                if (response.ok) {
                    // Data fetch will start once initial sync attempt completes.
                }
            } catch (e) {
                console.error('Auto-sync failed:', e)
            } finally {
                setInitialSyncDone(true)
                setIsSyncing(false)
            }
        }
        autoSync()
    }, [])

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            const response = await fetch('/api/sync-analytics', {
                method: 'POST'
            })

            if (!response.ok) {
                throw new Error('Failed to sync analytics')
            }

            const result = await response.json()

            toast({
                title: "Analytics synced",
                description: `Successfully synced ${result.synced || 0} posts`,
            })

            // Refresh analytics data
            mutate()
        } catch (error) {
            console.error('Sync error:', error)
            toast({
                title: "Sync failed",
                description: "Failed to sync analytics. Please try again.",
                variant: "destructive",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const handleExport = () => {
        // TODO: Implement export functionality
        console.log('Exporting analytics data...')
        alert('Export functionality coming soon!')
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <AnalyticsHeader
                dateRange={dateRange}
                granularity={granularity}
                onDateRangeChange={setDateRange}
                onGranularityChange={setGranularity}
                onExport={handleExport}
                onSync={handleSync}
                isSyncing={isSyncing}
            />

            {/* Loading state */}
            {(!initialSyncDone || isLoading) && <AnalyticsLoadingSkeleton />}

            {/* Error state */}
            {error && (
                <div
                    className="rounded-xl p-6 text-center"
                    style={{
                        background: 'rgba(248,113,113,0.06)',
                        border: '1px solid rgba(248,113,113,0.2)',
                    }}
                >
                    <p className="font-medium" style={{ color: '#f87171' }}>Failed to load analytics data</p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>Please try again later</p>
                </div>
            )}

            {/* Data loaded */}
            {data && initialSyncDone && !isLoading && (
                <>
                    {/* KPI Cards */}
                    <KPICards
                        engagement={data.kpis.engagement}
                        views={data.kpis.views}
                        followers={data.kpis.followers}
                        growthRate={data.kpis.growthRate}
                    />

                    {/* Follower Growth Chart */}
                    <FollowerGrowthChart data={data.followerGrowth} />

                    {/* Three column grid */}
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {/* Latest Post */}
                        <LatestPostCard post={data.latestPost} />

                        {/* Account Analytics */}
                        <AccountAnalyticsCard data={data.accountAnalytics} />

                        {/* Other Posts */}
                        <OtherPostsList posts={data.otherPosts} />
                    </div>
                </>
            )}
        </div>
    )
}
