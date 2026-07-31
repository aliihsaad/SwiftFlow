"use client"

import { useState, useEffect, useRef } from "react"
import useSWR from "swr"
import { AnalyticsPlatformView, DateRange, Granularity, AnalyticsResponse } from "@/types/analytics"
import { AnalyticsHeader } from "@/components/analytics/analytics-header"
import { KPICards } from "@/components/analytics/kpi-cards"
import { FollowerGrowthChart } from "@/components/analytics/engagement-chart"
import { LatestPostCard } from "@/components/analytics/latest-post-card"
import { AccountAnalyticsCard } from "@/components/analytics/account-analytics-card"
import { ContentIntelligenceInsights } from "@/components/analytics/content-intelligence-insights"
import { OtherPostsList } from "@/components/analytics/other-posts-list"
import { AnalyticsLoadingSkeleton } from "@/components/analytics/analytics-loading"
import { useToast } from "@/components/ui/use-toast"
import { InlineLoadingHint } from "@/components/ui/inline-loading-hint"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import { AlertTriangle, Eye, Heart, Info, Link2, MessageCircle, ShieldAlert, Share2 } from "lucide-react"
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

function formatPlatformLabel(platform: AnalyticsPlatformView): string {
    if (platform === 'instagram') return 'instagram'
    if (platform === 'facebook') return 'facebook'
    return 'all'
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
    const [platformView, setPlatformView] = useState<AnalyticsPlatformView>('all')
    const [dateRange, setDateRange] = useState<DateRange>('last_7_days')
    const [granularity, setGranularity] = useState<Granularity>('daily')
    const [isSyncing, setIsSyncing] = useState(false)
    const [initialSyncDone, setInitialSyncDone] = useState(false)
    const { toast } = useToast()
    const canSyncAnalytics = useWorkspacePermission("analytics:sync")
    const analyticsFetchReady = initialSyncDone || !canSyncAnalytics

    // Fetch analytics data
    const { data, error, isLoading, isValidating, mutate } = useSWR<AnalyticsResponse>(
        analyticsFetchReady ? `/api/analytics?range=${dateRange}&granularity=${granularity}&platform=${platformView}` : null,
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
    } = useSWR<AnalyticsInsightsResult>(
        analyticsFetchReady ? `/api/content-intelligence/analytics-insights?range=${dateRange}&platform=${platformView}` : null,
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
        if (!data) {
            toast({
                title: "Nothing to export",
                description: "Load analytics data first, then export the current view.",
            })
            return
        }

        const generatedAt = new Date().toISOString()
        const platformLabel = formatPlatformLabel(platformView)
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
            ['kpi', 'facebook_followers', data.kpis.followers.facebook, platformLabel, rangeLabel, granularity, generatedAt],
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
    const contentDiscovery = data?._meta?.contentDiscovery?.byPlatform || []
    const selectedAnalyticsPlatform = data?._meta?.selectedPlatform || platformView
    const relevantPlatformStatuses = analyticsPlatformStatuses.filter((s) =>
        selectedAnalyticsPlatform === 'all' ? true : s.platform === selectedAnalyticsPlatform
    )
    const facebookDiscovery = contentDiscovery.find((entry) => entry.platform === 'facebook') || null
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
    const showInitialAnalyticsLoading = (!analyticsFetchReady || (isLoading && !data))
    const showAnalyticsRefreshingHint = analyticsFetchReady && !!data && (isValidating || isSyncing)
    const partialAnalyticsTitle =
        selectedAnalyticsPlatform === 'all'
            ? 'Analytics is partially available (combined view)'
            : `${selectedAnalyticsPlatform === 'instagram' ? 'Instagram' : 'Facebook'} analytics is partially available`

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
        <section className="space-y-5 pb-8" aria-label="Performance intelligence">
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
                    className="rounded-[24px] p-8 text-center"
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
            {data && analyticsFetchReady && !showInitialAnalyticsLoading && (
                <>
                    {/* Platform-specific analytics status badges (mixed dashboard clarity) */}
                    {analyticsPlatformStatuses.length > 0 && (
                        <div className="grid gap-3 md:grid-cols-2">
                            {analyticsPlatformStatuses.map((status) => (
                                <div
                                    key={status.platform}
                                    className="min-w-[180px] rounded-2xl px-4 py-3.5"
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
                            className="space-y-2 rounded-[22px] p-5"
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
                                            : partialAnalyticsTitle}
                                    </p>
                                    {!isNoConnectedAccounts && selectedAnalyticsPlatform === 'all' && analyticsPlatformStatuses.length > 0 && (
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

                    {!!facebookDiscovery && (selectedAnalyticsPlatform === 'all' || selectedAnalyticsPlatform === 'facebook') && (
                        <div
                            className="rounded-[24px] p-5 sm:p-6"
                            style={{
                                background: 'rgba(34,211,238,0.06)',
                                border: '1px solid rgba(34,211,238,0.16)',
                            }}
                        >
                            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-2 max-w-2xl">
                                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">
                                        Facebook Page Intelligence
                                    </div>
                                    <h3 className="text-lg font-semibold text-white/90">
                                        Existing Page content is being synced into your analytics layer.
                                    </h3>
                                    <p className="text-sm leading-relaxed text-white/60">
                                        This is powered by the already approved <span className="font-semibold text-white/78">pages_read_engagement</span> permission. SwiftFlow can discover native Facebook Page posts in addition to app-managed posts, then fold them into analytics and content intelligence.
                                    </p>
                                </div>

                                <div className="grid min-w-[280px] gap-3 sm:grid-cols-3">
                                    {[
                                        { label: 'Synced Posts', value: facebookDiscovery.totalSyncedPosts },
                                        { label: 'Native Page Posts', value: facebookDiscovery.discoveredNativePosts },
                                        { label: 'App-Managed Posts', value: facebookDiscovery.appManagedPosts },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="rounded-xl border p-3"
                                            style={{
                                                background: 'rgba(8,15,28,0.55)',
                                                borderColor: 'rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{item.label}</div>
                                            <div className="mt-2 text-xl font-semibold text-white/90">{item.value.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {facebookDiscovery.topPost && (
                                <div
                                    className="mt-5 rounded-xl border p-4"
                                    style={{
                                        background: 'rgba(8,15,28,0.52)',
                                        borderColor: 'rgba(255,255,255,0.08)',
                                    }}
                                >
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="space-y-2 max-w-2xl">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-100">
                                                    Top Facebook Post
                                                </span>
                                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white/55">
                                                    {facebookDiscovery.topPost.source === 'native_discovered' ? 'Native Page Content' : 'App-Managed'}
                                                </span>
                                            </div>
                                            <p className="text-sm leading-relaxed text-white/72">
                                                {facebookDiscovery.topPost.caption}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-4 text-xs text-white/55">
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Heart className="h-3.5 w-3.5 text-pink-400" />
                                                    {facebookDiscovery.topPost.likes.toLocaleString()}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <MessageCircle className="h-3.5 w-3.5 text-cyan-300" />
                                                    {facebookDiscovery.topPost.comments.toLocaleString()}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Share2 className="h-3.5 w-3.5 text-lime-300" />
                                                    {facebookDiscovery.topPost.shares.toLocaleString()}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Eye className="h-3.5 w-3.5 text-amber-300" />
                                                    {facebookDiscovery.topPost.views.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="space-y-3 lg:min-w-[220px]">
                                            <div className="text-xs text-white/45">
                                                Latest synced Facebook post:{' '}
                                                <span className="text-white/72">
                                                    {facebookDiscovery.latestPublishedAt
                                                        ? new Date(facebookDiscovery.latestPublishedAt).toLocaleString()
                                                        : 'Not available'}
                                                </span>
                                            </div>
                                            {facebookDiscovery.topPost.permalink && (
                                                <a
                                                    href={facebookDiscovery.topPost.permalink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/75 transition hover:bg-white/10"
                                                >
                                                    <Link2 className="h-3.5 w-3.5" />
                                                    Open Facebook Post
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <ContentIntelligenceInsights
                        data={intelligenceData}
                        isLoading={isIntelligenceLoading}
                        error={intelligenceError as Error | undefined}
                        platform={platformView}
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
