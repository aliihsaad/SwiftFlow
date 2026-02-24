"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { AnalyticsPlatformView, DateRange, Granularity, AnalyticsResponse } from "@/types/analytics"
import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { KPICards } from "@/components/analytics/kpi-cards"
import { FollowerGrowthChart } from "@/components/analytics/engagement-chart"
import { LatestPostCard } from "@/components/analytics/latest-post-card"
import { AccountAnalyticsCard } from "@/components/analytics/account-analytics-card"
import { OtherPostsList } from "@/components/analytics/other-posts-list"
import { AnalyticsLoadingSkeleton } from "@/components/analytics/analytics-loading"
import { useToast } from "@/components/ui/use-toast"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { AlertTriangle, Info, ShieldAlert } from "lucide-react"

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

export default function AnalyticsPage() {
    const [platformView, setPlatformView] = useState<AnalyticsPlatformView>('all')
    const [dateRange, setDateRange] = useState<DateRange>('last_7_days')
    const [granularity, setGranularity] = useState<Granularity>('daily')
    const [isSyncing, setIsSyncing] = useState(false)
    const [initialSyncDone, setInitialSyncDone] = useState(false)
    const { toast } = useToast()

    // Fetch analytics data
    const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsResponse>(
        initialSyncDone ? `/api/analytics?range=${dateRange}&granularity=${granularity}&platform=${platformView}` : null,
        fetcher,
        {
            revalidateOnFocus: false,
            dedupingInterval: 60000, // 1 minute
            keepPreviousData: true,
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
            const result = await response.json().catch(() => ({})) as SyncAnalyticsResponse

            if (!response.ok) {
                const missingPerms = Array.isArray(result?.missingPermissions) && result.missingPermissions.length
                    ? ` Missing permissions: ${result.missingPermissions.join(', ')}.`
                    : ''
                const reconnect = result?.requiresReconnect ? ' Reconnect your Meta account in Settings.' : ''
                throw new Error((result?.error || 'Failed to sync analytics') + missingPerms + reconnect)
            }

            const postsSynced = Number(result?.posts?.synced || 0)
            const accountsSynced = Number(result?.accounts?.synced || 0)
            const directPosts = Number(result?.posts?.direct?.posts_upserted || 0)
            const directMetrics = Number(result?.posts?.direct?.metrics_upserted || 0)
            const partialWarnings = result?._meta?.warnings || []

            toast({
                title: result?._meta?.partial ? "Analytics synced (partial)" : "Analytics synced",
                description: result?._meta?.partial
                    ? (partialWarnings[0] || `Posts were synced, but some analytics metrics are unavailable right now.`)
                    : `Synced ${postsSynced} post analytics entries and ${accountsSynced} account analytics entries.`,
            })

            if (result?._meta?.partial) {
                console.warn('[Analytics Sync] Partial sync:', {
                    warnings: partialWarnings,
                    suspectedMissingPermissions: result?._meta?.suspectedMissingPermissions,
                    directPosts,
                    directMetrics,
                })
            }

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
        toast({
            title: "Export coming soon",
            description: "Analytics export is not implemented yet.",
        })
    }

    const analyticsWarnings = data?._meta?.warnings || []
    const analyticsSuspectedMissingPermissions = data?._meta?.suspectedMissingPermissions || []
    const analyticsPlatformStatuses = data?._meta?.platformStatuses || []
    const selectedAnalyticsPlatform = data?._meta?.selectedPlatform || platformView
    const relevantPlatformStatuses = analyticsPlatformStatuses.filter((s) =>
        selectedAnalyticsPlatform === 'all' ? true : s.platform === selectedAnalyticsPlatform
    )
    const isScopeHeuristicMode = relevantPlatformStatuses.length > 0 && relevantPlatformStatuses.some((s) => !s.exactScopesKnown)
    const isNoConnectedAccounts =
        data?._meta?.reason === 'no_connected_accounts' ||
        data?._meta?.reason === 'no_connected_accounts_for_platform'
    const isPartialAnalytics =
        !!data?._meta &&
        (
            data?._meta?.capabilities?.accountMetrics?.status === 'partial' ||
            data?._meta?.capabilities?.accountMetrics?.status === 'unavailable' ||
            (data?._meta?.hasPublishedPosts && data?._meta?.capabilities?.postMetrics?.status !== 'available')
        )
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
    const showInitialAnalyticsLoading = (!initialSyncDone || (isLoading && !data))
    const showAnalyticsRefreshingHint = initialSyncDone && !!data && (isValidating || isSyncing)

    const getStatusChipStyle = (status: 'available' | 'partial' | 'unavailable') => {
        if (status === 'available') {
            return {
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.18)',
                color: '#86efac',
            }
        }
        if (status === 'partial') {
            return {
                background: 'rgba(245,158,11,0.10)',
                border: '1px solid rgba(245,158,11,0.18)',
                color: '#fbbf24',
            }
        }
        return {
            background: 'rgba(239,68,68,0.10)',
            border: '1px solid rgba(239,68,68,0.18)',
            color: '#fca5a5',
        }
    }

    const formatStatusLabel = (status: 'available' | 'partial' | 'unavailable') => {
        if (status === 'available') return 'OK'
        if (status === 'partial') return 'Partial'
        return 'Unavailable'
    }

    return (
        <div className="space-y-6">
            {/* Page header */}
            <AnalyticsHeader
                platformView={platformView}
                dateRange={dateRange}
                granularity={granularity}
                onPlatformViewChange={setPlatformView}
                onDateRangeChange={setDateRange}
                onGranularityChange={setGranularity}
                onExport={handleExport}
                onSync={handleSync}
                isSyncing={isSyncing}
            />

            {showAnalyticsRefreshingHint && (
                <InlineLoadingHint
                    label={isSyncing ? 'Syncing analytics and refreshing data…' : 'Refreshing analytics…'}
                />
            )}

            {/* Loading state */}
            {showInitialAnalyticsLoading && <AnalyticsLoadingSkeleton />}

            {/* Error state */}
            {error && !showInitialAnalyticsLoading && (
                <div
                    className="rounded-xl p-6 text-center"
                    style={{
                        background: 'rgba(248,113,113,0.06)',
                        border: '1px solid rgba(248,113,113,0.2)',
                    }}
                >
                    <p className="font-medium" style={{ color: '#f87171' }}>
                        {analyticsError?.errorCode === 'meta_missing_permission'
                            ? 'Analytics permissions missing'
                            : analyticsError?.errorCode === 'meta_auth_invalid_token'
                                ? 'Analytics access token invalid'
                                : 'Failed to load analytics data'}
                    </p>
                    <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {analyticsError?.message || 'Please try again later'}
                    </p>
                </div>
            )}

            {/* Data loaded */}
            {data && initialSyncDone && !showInitialAnalyticsLoading && (
                <>
                    {/* Platform-specific analytics status badges (mixed dashboard clarity) */}
                    {analyticsPlatformStatuses.length > 0 && (
                        <div className="flex flex-wrap items-start gap-2">
                            {analyticsPlatformStatuses.map((status) => (
                                <div
                                    key={status.platform}
                                    className="px-3 py-2 rounded-lg min-w-[180px]"
                                    style={getStatusChipStyle(status.status)}
                                    title={status.warnings?.[0] || `${status.platform} analytics status`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-semibold">
                                            {status.platform === 'instagram' ? 'Instagram' : 'Facebook'}
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wide">
                                            {formatStatusLabel(status.status)}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                                        Account: {status.accountMetricsStatus} • Posts: {status.postMetricsStatus}
                                    </div>
                                    {!status.exactScopesKnown && (
                                        <div className="mt-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                            Scopes: heuristic
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Analytics capability / partial-data notices */}
                    {(isNoConnectedAccounts || analyticsWarnings.length > 0) && (
                        <div
                            className="rounded-xl p-4 space-y-2"
                            style={{
                                background: isNoConnectedAccounts ? 'rgba(59,130,246,0.06)' : 'rgba(245,158,11,0.06)',
                                border: isNoConnectedAccounts ? '1px solid rgba(59,130,246,0.18)' : '1px solid rgba(245,158,11,0.2)',
                            }}
                        >
                            <div className="flex items-start gap-2">
                                {isNoConnectedAccounts ? (
                                    <Info className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#60a5fa' }} />
                                ) : isPartialAnalytics ? (
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
                                ) : (
                                    <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" style={{ color: '#f59e0b' }} />
                                )}
                                <div className="min-w-0">
                                    <p
                                        className="text-sm font-semibold"
                                        style={{ color: isNoConnectedAccounts ? '#60a5fa' : '#fbbf24' }}
                                    >
                                        {isNoConnectedAccounts
                                            ? (selectedAnalyticsPlatform === 'all'
                                                ? 'Connect accounts to start analytics sync'
                                                : `Connect ${selectedAnalyticsPlatform === 'instagram' ? 'Instagram' : 'Facebook'} to view analytics`)
                                            : 'Analytics is partially available (combined view)'}
                                    </p>
                                    {!isNoConnectedAccounts && analyticsPlatformStatuses.length > 0 && (
                                        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                            This dashboard combines Instagram and Facebook. A warning can appear when only one platform is partial.
                                        </p>
                                    )}
                                    {analyticsWarnings.slice(0, 2).map((warning, idx) => (
                                        <p key={idx} className="text-xs mt-1 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                            {warning}
                                        </p>
                                    ))}
                                    {!!analyticsSuspectedMissingPermissions.length && (
                                        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                            {isScopeHeuristicMode ? 'Possible related permissions (heuristic): ' : 'Likely required permissions: '}
                                            <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                                                {analyticsSuspectedMissingPermissions.join(', ')}
                                            </span>
                                        </p>
                                    )}
                                    {isScopeHeuristicMode && (
                                        <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.34)' }}>
                                            Scope status is not recorded for this connected account yet. Reconnect once to store exact granted scopes and remove heuristic warnings.
                                        </p>
                                    )}
                                    {!isNoConnectedAccounts && analyticsPlatformStatuses.some((s) => s.warnings?.length > 0) && (
                                        <div className="mt-2 space-y-1">
                                            {analyticsPlatformStatuses
                                                .filter((s) => Array.isArray(s.warnings) && s.warnings.length > 0)
                                                .slice(0, 2)
                                                .map((s) => (
                                                    <p key={s.platform} className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                                                            {s.platform === 'instagram' ? 'Instagram' : 'Facebook'}:
                                                        </span>{' '}
                                                        {s.warnings[0]}
                                                    </p>
                                                ))}
                                        </div>
                                    )}
                                    {data?._meta?.capabilities && (
                                        <p className="text-xs mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                            Account metrics: {data._meta.capabilities.accountMetrics.status} • Post metrics: {data._meta.capabilities.postMetrics.status}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

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
