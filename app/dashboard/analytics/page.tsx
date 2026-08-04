"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import useSWR from "swr"
import { DateRange, Granularity, AnalyticsResponse } from "@/types/analytics"
import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { KPICards } from "@/components/analytics/kpi-cards"
import { FollowerGrowthChart } from "@/components/analytics/engagement-chart"
import { LatestPostCard } from "@/components/analytics/latest-post-card"
import { AccountAnalyticsCard } from "@/components/analytics/account-analytics-card"
import { ContentIntelligenceInsights } from "@/components/analytics/content-intelligence-insights"
import { OtherPostsList } from "@/components/analytics/other-posts-list"
import {
    AnalyticsHealthPanel,
    type AnalyticsSyncFeedback,
} from "@/components/analytics/analytics-health-panel"
import { AnalyticsLoadingSkeleton } from "@/components/analytics/analytics-loading"
import { useToast } from "@/components/ui/use-toast"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import type { AnalyticsInsightsResult } from "@/lib/content-intelligence/types"

const fetcher = async (url: string) => {
    const res = await fetch(url, { cache: "no-store" })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
        const err = new Error(payload?.error || "Failed to fetch analytics") as Error & {
            errorCode?: string
            missingPermissions?: string[]
            requiresReconnect?: boolean
        }
        err.errorCode = payload?.errorCode
        err.missingPermissions = payload?.missingPermissions
        err.requiresReconnect = payload?.requiresReconnect
        throw err
    }
    return payload
}

type SyncAnalyticsResponse = {
    success: boolean
    workspaceId: string
    posts?: {
        synced?: number
        direct?: {
            posts_upserted?: number
            metrics_upserted?: number
            errors?: number
        }
    }
    accounts?: {
        synced?: number
    }
    _meta?: {
        partial?: boolean
        requiresReconnect?: boolean
        warnings?: string[]
        suspectedMissingPermissions?: string[]
        sync?: {
            postsSynced?: number
            accountsSynced?: number
            direct?: {
                postsUpserted?: number
                metricsUpserted?: number
                errors?: number
            }
        }
    }
    error?: string
    errorCode?: string
    missingPermissions?: string[]
    requiresReconnect?: boolean
}

function toSyncFeedback(responseOk: boolean, result: SyncAnalyticsResponse): AnalyticsSyncFeedback {
    if (!responseOk) {
        return {
            tone: "error",
            title: result?.requiresReconnect ? "Reconnect required" : "Sync failed",
            message: result?.error || "SwiftFlow could not refresh analytics. Try again in a moment.",
            missingPermissions: result?.missingPermissions,
            requiresReconnect: result?.requiresReconnect,
        }
    }

    const warnings = result?._meta?.warnings || []
    if (result?._meta?.partial) {
        return {
            tone: "warning",
            title: "Analytics synced with limited data",
            message: warnings[0] || "Available metrics were refreshed while some provider data remains unavailable.",
            missingPermissions: result?._meta?.suspectedMissingPermissions,
            requiresReconnect: result?._meta?.requiresReconnect === true ||
                (result?._meta?.suspectedMissingPermissions || [])
                    .includes("instagram_business_manage_insights"),
        }
    }

    const postsSynced = Number(result?.posts?.synced || 0)
    const accountsSynced = Number(result?.accounts?.synced || 0)
    return {
        tone: "success",
        title: "Analytics synced",
        message: "Refreshed " + postsSynced + " post metrics and " + accountsSynced + " account snapshots.",
    }
}

function formatRangeLabel(range: DateRange): string {
    if (range === 'last_7_days') return 'last_7_days'
    if (range === 'last_30_days') return 'last_30_days'
    return 'last_90_days'
}

function escapeCsvValue(value: string | number | boolean | null | undefined): string {
    const normalized = value == null ? '' : String(value)
    if (/[",\n]/.test(normalized)) {
        return `"${normalized.replace(/"/g, '""')}"`
    }
    return normalized
}

function downloadCsv(filename: string, rows: Array<Array<string | number | boolean | null | undefined>>) {
    const csv = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

export default function AnalyticsPage() {
    const [dateRange, setDateRange] = useState<DateRange>('last_7_days')
    const [granularity, setGranularity] = useState<Granularity>('daily')
    const [isSyncing, setIsSyncing] = useState(false)
    const [syncFeedback, setSyncFeedback] = useState<AnalyticsSyncFeedback | null>(null)
    const [initialSyncDone, setInitialSyncDone] = useState(false)
    const { toast } = useToast()
    const canSyncAnalytics = useWorkspacePermission("analytics:sync")
    const analyticsFetchReady = initialSyncDone || !canSyncAnalytics

    // Fetch analytics data
    const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsResponse>(
        analyticsFetchReady ? `/api/analytics?range=${dateRange}&granularity=${granularity}&platform=instagram` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
            keepPreviousData: true,
        }
    )
    const {
        data: intelligenceData,
        error: intelligenceError,
        isLoading: isIntelligenceLoading,
        mutate: mutateIntelligence,
    } = useSWR<AnalyticsInsightsResult>(
        analyticsFetchReady ? `/api/content-intelligence/analytics-insights?range=${dateRange}&platform=instagram` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000,
            keepPreviousData: true,
        }
    )

    // Auto-sync analytics on page load (since cron is not available)
    const hasSynced = useRef(false)
    useEffect(() => {
        if (hasSynced.current) return
        hasSynced.current = true
        if (!canSyncAnalytics) {
            return
        }

        const autoSync = async () => {
            setIsSyncing(true)
            try {
                const response = await fetch('/api/sync-analytics', { method: 'POST' })
                const result = await response.json().catch(() => ({})) as SyncAnalyticsResponse
                setSyncFeedback(toSyncFeedback(response.ok, result))
            } catch (error) {
                console.error('Auto-sync failed:', error)
                setSyncFeedback({
                    tone: "error",
                    title: "Sync unavailable",
                    message: error instanceof Error
                        ? error.message
                        : "SwiftFlow could not reach the analytics sync service.",
                })
            } finally {
                setInitialSyncDone(true)
                setIsSyncing(false)
            }
        }
        autoSync()
    }, [canSyncAnalytics])

    const handleSync = async () => {
        if (!canSyncAnalytics) {
            toast({
                title: "Read-only role",
                description: "Only admins and owners can sync analytics for this workspace.",
                variant: "destructive",
            })
            return
        }

        setIsSyncing(true)
        try {
            const response = await fetch('/api/sync-analytics', { method: 'POST' })
            const result = await response.json().catch(() => ({})) as SyncAnalyticsResponse
            const feedback = toSyncFeedback(response.ok, result)
            setSyncFeedback(feedback)

            toast({
                title: feedback.title,
                description: feedback.message,
                variant: feedback.tone === "error" ? "destructive" : "default",
            })

            if (!response.ok) return

            await Promise.all([
                mutate(),
                mutateIntelligence(),
            ])
        } catch (error) {
            console.error('Sync error:', error)
            const message = error instanceof Error
                ? error.message
                : "SwiftFlow could not refresh analytics. Try again in a moment."
            setSyncFeedback({
                tone: "error",
                title: "Sync failed",
                message,
            })
            toast({
                title: "Sync failed",
                description: message,
                variant: "destructive",
            })
        } finally {
            setIsSyncing(false)
        }
    }

    const handleExport = () => {
        if (!data) {
            toast({
                title: "Nothing to export",
                description: "Load analytics data first, then export the current view.",
            })
            return
        }

        const generatedAt = new Date().toISOString()
        const platformLabel = 'instagram'
        const rangeLabel = formatRangeLabel(dateRange)
        const filename = `analytics-${platformLabel}-${rangeLabel}-${granularity}-${generatedAt.slice(0, 10)}.csv`

        const rows: Array<Array<string | number | boolean | null | undefined>> = [
            ['section', 'key', 'value', 'platform', 'date_range', 'granularity', 'generated_at'],
            ['context', 'platform', platformLabel, platformLabel, rangeLabel, granularity, generatedAt],
            ['context', 'date_range', rangeLabel, platformLabel, rangeLabel, granularity, generatedAt],
            ['context', 'granularity', granularity, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'engagement', data.kpis.engagement.value, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'engagement_change_pct', data.kpis.engagement.changePct, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'views', data.kpis.views.value, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'views_change_pct', data.kpis.views.changePct, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'followers', data.kpis.followers.value, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'followers_change_pct', data.kpis.followers.changePct, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'instagram_followers', data.kpis.followers.instagram, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'growth_rate', data.kpis.growthRate.value, platformLabel, rangeLabel, granularity, generatedAt],
            ['kpi', 'growth_rate_change_pct', data.kpis.growthRate.changePct, platformLabel, rangeLabel, granularity, generatedAt],
            ['account', 'total_reach', data.accountAnalytics.totalReach, platformLabel, rangeLabel, granularity, generatedAt],
            ['account', 'total_engagement', data.accountAnalytics.totalEngagement, platformLabel, rangeLabel, granularity, generatedAt],
        ]

        ;(data._meta?.warnings || []).forEach((warning, index) => {
            rows.push(['warning', `warning_${index + 1}`, warning, platformLabel, rangeLabel, granularity, generatedAt])
        })

        ;(data._meta?.suspectedMissingPermissions || []).forEach((permission, index) => {
            rows.push(['permission_hint', `missing_permission_${index + 1}`, permission, platformLabel, rangeLabel, granularity, generatedAt])
        })

        data.followerGrowth.labels.forEach((label, index) => {
            rows.push([
                'follower_growth',
                label,
                data.followerGrowth.values[index] ?? 0,
                platformLabel,
                rangeLabel,
                granularity,
                generatedAt,
            ])
        })

        const posts = [data.latestPost, ...data.otherPosts].filter(Boolean)
        posts.forEach((post, index) => {
            if (!post) return
            rows.push([
                'post',
                `post_${index + 1}`,
                post.caption,
                post.platform,
                rangeLabel,
                granularity,
                generatedAt,
            ])
            rows.push(['post_metric', `${post.id}_likes`, post.likes, post.platform, rangeLabel, granularity, generatedAt])
            rows.push(['post_metric', `${post.id}_comments`, post.comments, post.platform, rangeLabel, granularity, generatedAt])
            rows.push(['post_metric', `${post.id}_shares`, post.shares, post.platform, rangeLabel, granularity, generatedAt])
            rows.push(['post_metric', `${post.id}_views`, post.views, post.platform, rangeLabel, granularity, generatedAt])
            rows.push(['post_metric', `${post.id}_timestamp`, post.timestamp, post.platform, rangeLabel, granularity, generatedAt])
        })

        downloadCsv(filename, rows)
        toast({
            title: "Analytics exported",
            description: `Downloaded ${filename}`,
        })
    }

    const analyticsWarnings = data?._meta?.warnings || []
    const analyticsSuspectedMissingPermissions = data?._meta?.suspectedMissingPermissions || []
    const analyticsPlatformStatuses = data?._meta?.platformStatuses || []
    const analyticsError = error as (Error & {
        errorCode?: string
        missingPermissions?: string[]
        requiresReconnect?: boolean
    }) | undefined
    const kpiComparisonLabel =
        dateRange === 'last_7_days'
            ? 'vs previous 7 days'
            : dateRange === 'last_30_days'
                ? 'vs previous 30 days'
                : 'vs previous 90 days'
    const showInitialAnalyticsLoading = (!analyticsFetchReady || (isLoading && !data))
    const showAnalyticsRefreshingHint = analyticsFetchReady && !!data && (isValidating || isSyncing)

    return (
        <section className="space-y-5 pb-8" aria-label="Performance intelligence">
            {/* Page header */}
            <AnalyticsHeader
                dateRange={dateRange}
                granularity={granularity}
                onDateRangeChange={setDateRange}
                onGranularityChange={setGranularity}
                onExport={handleExport}
                onSync={handleSync}
                isSyncing={isSyncing}
                syncDisabled={!canSyncAnalytics}
                syncDisabledReason={!canSyncAnalytics ? "Admins/owners only" : undefined}
            />

            {showAnalyticsRefreshingHint && (
                <InlineLoadingHint
                    label={isSyncing ? 'Analyzing your data and refreshing insights…' : 'Refreshing analytics insights…'}
                />
            )}

            {/* Loading state */}
            {showInitialAnalyticsLoading && <AnalyticsLoadingSkeleton />}

            {/* Error state */}
            {error && !showInitialAnalyticsLoading && (
                <div
                    role="alert"
                    className="rounded-[24px] border border-rose-300/20 bg-rose-400/[0.055] p-6 sm:p-8"
                >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-200/55">
                        Analytics connection
                    </p>
                    <h2 className="mt-2 text-lg font-semibold text-white/90">
                        {analyticsError?.errorCode === 'meta_missing_permission'
                            ? 'Reconnect Instagram to approve insights'
                            : analyticsError?.errorCode === 'meta_auth_invalid_token'
                                ? 'Your Instagram connection has expired'
                                : 'Analytics could not be loaded'}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/52">
                        {analyticsError?.message || 'SwiftFlow could not load this analytics view. Try again in a moment.'}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void mutate()}
                            className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.05] px-4 text-sm font-semibold text-white/78 transition hover:bg-white/[0.09]"
                        >
                            Retry view
                        </button>
                        {(analyticsError?.requiresReconnect || analyticsError?.errorCode === 'meta_missing_permission') ? (
                            <Link
                                href="/dashboard/onboarding/instagram"
                                className="inline-flex h-10 items-center rounded-xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                            >
                                Reconnect Instagram
                            </Link>
                        ) : null}
                    </div>
                </div>
            )}

            {/* Data loaded */}
            {data && analyticsFetchReady && !showInitialAnalyticsLoading && (
                <>
                    <AnalyticsHealthPanel
                        platformStatuses={analyticsPlatformStatuses}
                        warnings={analyticsWarnings}
                        suspectedMissingPermissions={analyticsSuspectedMissingPermissions}
                        reason={data._meta?.reason}
                        feedback={syncFeedback}
                        isSyncing={isSyncing}
                        canSync={canSyncAnalytics}
                        onSync={handleSync}
                    />

                    {/* KPI Cards */}
                    <KPICards
                        engagement={data.kpis.engagement}
                        views={data.kpis.views}
                        followers={data.kpis.followers}
                        growthRate={data.kpis.growthRate}
                        comparisonLabel={kpiComparisonLabel}
                    />

                    {/* Follower Growth Chart */}
                    <FollowerGrowthChart data={data.followerGrowth} />

                    <ContentIntelligenceInsights
                        data={intelligenceData}
                        isLoading={isIntelligenceLoading}
                        error={intelligenceError as Error | undefined}
                        platform="instagram"
                    />

                    {/* Three column grid */}
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {/* Latest Post */}
                        <LatestPostCard post={data.latestPost} />

                        {/* Account Analytics */}
                        <AccountAnalyticsCard data={data.accountAnalytics} />

                        {/* Other Posts */}
                        <OtherPostsList posts={data.otherPosts} />
                    </div>
                </>
            )}
        </section>
    )
}
