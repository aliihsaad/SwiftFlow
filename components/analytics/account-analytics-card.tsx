"use client"

import { AccountAnalytics } from "@/types/analytics"
import { TrendingUp, Users, Activity } from "lucide-react"

interface AccountAnalyticsCardProps {
    data: AccountAnalytics
}

export function AccountAnalyticsCard({ data }: AccountAnalyticsCardProps) {
    const stats = [
        {
            label: "Total Reach",
            value: data.totalReach.toLocaleString(),
            icon: TrendingUp,
            color: '#22d3ee',
        },
        {
            label: "Total Engagement",
            value: data.totalEngagement.toLocaleString(),
            icon: Activity,
            color: '#fb7185',
        },
        {
            label: "Followers",
            value: data.followers.toLocaleString(),
            icon: Users,
            color: '#84cc16',
            breakdown: (data.facebookFollowers > 0 || data.instagramFollowers > 0)
                ? { fb: data.facebookFollowers, ig: data.instagramFollowers }
                : null,
        },
    ]

    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
            }}
        >
            {/* Header */}
            <div
                className="px-5 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
                <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>Account Analytics</h3>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Last 30 days</p>
            </div>

            {/* Stats */}
            <div className="p-5">
                <div className="grid grid-cols-3 gap-4">
                    {stats.map((stat) => {
                        const Icon = stat.icon
                        return (
                            <div key={stat.label} className="text-center space-y-2">
                                <div className="flex justify-center">
                                    <div
                                        className="flex h-9 w-9 items-center justify-center rounded-xl"
                                        style={{ background: `${stat.color}14` }}
                                    >
                                        <Icon className="h-4 w-4" style={{ color: stat.color }} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xl font-bold tabular-nums" style={{ color: 'rgba(255,255,255,0.85)' }}>
                                        {stat.value}
                                    </p>
                                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                        {stat.label}
                                    </p>
                                </div>
                                {'breakdown' in stat && stat.breakdown && (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                            <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#22d3ee' }} />
                                            {stat.breakdown.fb.toLocaleString()}
                                        </span>
                                        <span className="flex items-center gap-1 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                            <span className="h-1.5 w-1.5 rounded-full inline-block" style={{ background: '#fb7185' }} />
                                            {stat.breakdown.ig.toLocaleString()}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
