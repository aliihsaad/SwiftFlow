"use client"

import { useState } from "react"
import useSWR from "swr"
import { DateRange, Granularity, AnalyticsResponse } from "@/types/analytics"
import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { KPICards } from "@/components/analytics/kpi-cards"
import { FollowerGrowthChart } from "@/components/analytics/engagement-chart"
import { LatestPostCard } from "@/components/analytics/latest-post-card"
import { AccountAnalyticsCard } from "@/components/analytics/account-analytics-card"
import { OtherPostsList } from "@/components/analytics/other-posts-list"
import { AnalyticsLoadingSkeleton } from "@/components/analytics/analytics-loading"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState<DateRange>('last_7_days')
    const [granularity, setGranularity] = useState<Granularity>('daily')

    // Fetch analytics data
    const { data, error, isLoading } = useSWR<AnalyticsResponse>(
        `/api/analytics?range=${dateRange}&granularity=${granularity}`,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
        }
    )

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
            />

            {/* Loading state */}
            {isLoading && <AnalyticsLoadingSkeleton />}

            {/* Error state */}
            {error && (
                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
                    <p className="text-destructive font-medium">Failed to load analytics data</p>
                    <p className="text-sm text-muted-foreground mt-2">Please try again later</p>
                </div>
            )}

            {/* Data loaded */}
            {data && !isLoading && (
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
