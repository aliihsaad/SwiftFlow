"use client"

import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    Eye,
    Percent,
    Users,
} from "lucide-react"

import { cn } from "@/lib/utils"
import type { FollowersKPIData, KPIData } from "@/types/analytics"

interface KPICardsProps {
    engagement: KPIData
    views: KPIData
    followers: FollowersKPIData
    growthRate: KPIData
    comparisonLabel?: string
}

export function KPICards({
    engagement,
    views,
    followers,
    growthRate,
    comparisonLabel = "vs previous period",
}: KPICardsProps) {
    const kpis = [
        {
            title: "Engagement",
            value: engagement.value.toLocaleString(),
            change: engagement.changePct,
            icon: Activity,
            tone: "pink" as const,
            helper: "Reactions, comments, and shares",
        },
        {
            title: "Views",
            value: views.display || views.value.toLocaleString(),
            change: views.changePct,
            icon: Eye,
            tone: "cyan" as const,
            helper: "Available provider view totals",
        },
        {
            title: "Followers",
            value: followers.value.toLocaleString(),
            change: followers.changePct,
            icon: Users,
            tone: "lime" as const,
            helper: "Current Instagram audience",
        },
        {
            title: "Growth rate",
            value: `${growthRate.value}%`,
            change: growthRate.changePct,
            icon: Percent,
            tone: "amber" as const,
            helper: "Audience change in this window",
        },
    ]

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => {
                const positive = kpi.change >= 0
                const Icon = kpi.icon
                const TrendIcon = positive ? ArrowUpRight : ArrowDownRight
                const tone = toneStyles[kpi.tone]

                return (
                    <article
                        key={kpi.title}
                        className={cn(
                            "group relative overflow-hidden rounded-[22px] border bg-[#10131c] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.16)] transition hover:-translate-y-0.5",
                            tone.border,
                        )}
                    >
                        <div className={cn("pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full blur-3xl", tone.glow)} />
                        <div className="relative flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">{kpi.title}</p>
                                <p className="mt-3 text-3xl font-semibold tracking-[-0.045em] text-white tabular-nums">{kpi.value}</p>
                            </div>
                            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", tone.icon)}>
                                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                            </span>
                        </div>

                        <div className="relative mt-5 border-t border-white/[0.055] pt-4">
                            <div className="flex items-center gap-1.5">
                                <TrendIcon className={cn("h-3.5 w-3.5", positive ? "text-emerald-300" : "text-rose-300")} aria-hidden="true" />
                                <span className={cn("text-xs font-semibold tabular-nums", positive ? "text-emerald-200" : "text-rose-200")}>{Math.abs(kpi.change)}%</span>
                                <span className="truncate text-[10px] text-white/24">{comparisonLabel}</span>
                            </div>
                            <p className="mt-2 text-[11px] leading-5 text-white/30">{kpi.helper}</p>

                        </div>
                    </article>
                )
            })}
        </div>
    )
}

const toneStyles = {
    pink: {
        border: "border-pink-200/10",
        icon: "border-pink-200/14 bg-pink-300/[0.075] text-pink-200",
        glow: "bg-pink-400/14",
    },
    cyan: {
        border: "border-cyan-200/10",
        icon: "border-cyan-200/14 bg-cyan-300/[0.075] text-cyan-200",
        glow: "bg-cyan-400/14",
    },
    lime: {
        border: "border-lime-200/10",
        icon: "border-lime-200/14 bg-lime-300/[0.075] text-lime-200",
        glow: "bg-lime-400/12",
    },
    amber: {
        border: "border-amber-200/10",
        icon: "border-amber-200/14 bg-amber-300/[0.075] text-amber-200",
        glow: "bg-amber-400/13",
    },
}
