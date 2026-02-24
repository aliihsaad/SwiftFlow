"use client"

import { KPIData, FollowersKPIData } from "@/types/analytics"
import { TrendingUp, TrendingDown, Eye, Users, Activity, Percent } from "lucide-react"

interface KPICardsProps {
    engagement: KPIData
    views: KPIData
    followers: FollowersKPIData
    growthRate: KPIData
    comparisonLabel?: string
}

export function KPICards({ engagement, views, followers, growthRate, comparisonLabel = "vs previous period" }: KPICardsProps) {
    const kpis = [
        {
            title: "Total Engagement",
            value: engagement.value.toLocaleString(),
            change: engagement.changePct,
            icon: Activity,
            accent: { border: 'rgba(251,113,133,0.18)', glow: '0 8px 28px rgba(251,113,133,0.08)', icon: '#fb7185', number: '#fda4af' },
            breakdown: null,
        },
        {
            title: "Total Views",
            value: views.display || views.value.toLocaleString(),
            change: views.changePct,
            icon: Eye,
            accent: { border: 'rgba(34,211,238,0.18)', glow: '0 8px 28px rgba(34,211,238,0.08)', icon: '#22d3ee', number: '#67e8f9' },
            breakdown: null,
        },
        {
            title: "Total Followers",
            value: followers.value.toLocaleString(),
            change: followers.changePct,
            icon: Users,
            accent: { border: 'rgba(132,204,22,0.16)', glow: '0 8px 28px rgba(132,204,22,0.08)', icon: '#84cc16', number: '#bef264' },
            breakdown: { facebook: followers.facebook || 0, instagram: followers.instagram || 0 },
        },
        {
            title: "Growth Rate",
            value: `${growthRate.value}%`,
            change: growthRate.changePct,
            icon: Percent,
            accent: { border: 'rgba(245,158,11,0.18)', glow: '0 8px 28px rgba(245,158,11,0.08)', icon: '#f59e0b', number: '#fbbf24' },
            breakdown: null,
        },
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => {
                const isPositive = kpi.change >= 0
                const Icon = kpi.icon
                const ChangeIcon = isPositive ? TrendingUp : TrendingDown

                return (
                    <div
                        key={kpi.title}
                        className="relative overflow-hidden rounded-xl p-5"
                        style={{
                            background: '#151620',
                            border: `1px solid ${kpi.accent.border}`,
                            boxShadow: `${kpi.accent.glow}, 0 1px 0 rgba(255,255,255,0.04) inset`,
                        }}
                    >
                        {/* Ambient glow */}
                        <div
                            className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl opacity-20"
                            style={{ background: kpi.accent.icon }}
                        />

                        {/* Header */}
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                                {kpi.title}
                            </span>
                            <div
                                className="flex h-8 w-8 items-center justify-center rounded-lg"
                                style={{ background: `${kpi.accent.icon}18` }}
                            >
                                <Icon className="h-4 w-4" style={{ color: kpi.accent.icon }} />
                            </div>
                        </div>

                        {/* Value */}
                        <div className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: kpi.accent.number }}>
                            {kpi.value}
                        </div>

                        {/* Breakdown (followers only) */}
                        {kpi.breakdown && (
                            <div className="flex items-center gap-3 mt-1.5">
                                <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                    <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#22d3ee' }} />
                                    FB: {kpi.breakdown.facebook.toLocaleString()}
                                </span>
                                <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                    <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#fb7185' }} />
                                    IG: {kpi.breakdown.instagram.toLocaleString()}
                                </span>
                            </div>
                        )}

                        {/* Trend */}
                        <div className="flex items-center gap-1 mt-2">
                            <ChangeIcon className="h-3 w-3" style={{ color: isPositive ? '#34d399' : '#f87171' }} />
                            <span className="text-xs font-semibold" style={{ color: isPositive ? '#34d399' : '#f87171' }}>
                                {Math.abs(kpi.change)}%
                            </span>
                            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>{comparisonLabel}</span>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
