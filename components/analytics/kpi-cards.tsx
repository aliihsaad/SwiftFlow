"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { KPIData, FollowersKPIData } from "@/types/analytics"
import { TrendingUp, TrendingDown, Eye, Users, Activity, Percent } from "lucide-react"
import { cn } from "@/lib/utils"

interface KPICardsProps {
    engagement: KPIData
    views: KPIData
    followers: FollowersKPIData
    growthRate: KPIData
}

export function KPICards({ engagement, views, followers, growthRate }: KPICardsProps) {
    const kpis = [
        {
            title: "Total Engagement",
            value: engagement.value.toLocaleString(),
            change: engagement.changePct,
            icon: Activity,
            gradient: "from-purple-500/20 to-pink-500/20",
            iconColor: "text-purple-500",
            borderColor: "border-purple-500/20",
        },
        {
            title: "Total Views",
            value: views.display || views.value.toLocaleString(),
            change: views.changePct,
            icon: Eye,
            gradient: "from-blue-500/20 to-cyan-500/20",
            iconColor: "text-blue-500",
            borderColor: "border-blue-500/20",
        },
        {
            title: "Total Followers",
            value: followers.value.toLocaleString(),
            change: followers.changePct,
            icon: Users,
            gradient: "from-green-500/20 to-emerald-500/20",
            iconColor: "text-green-500",
            borderColor: "border-green-500/20",
            breakdown: { facebook: followers.facebook || 0, instagram: followers.instagram || 0 },
        },
        {
            title: "Growth Rate",
            value: `${growthRate.value}%`,
            change: growthRate.changePct,
            icon: Percent,
            gradient: "from-orange-500/20 to-amber-500/20",
            iconColor: "text-orange-500",
            borderColor: "border-orange-500/20",
        },
    ]

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => {
                const isPositive = kpi.change >= 0
                const Icon = kpi.icon
                const ChangeIcon = isPositive ? TrendingUp : TrendingDown

                return (
                    <Card
                        key={kpi.title}
                        className={cn(
                            "bg-gradient-to-br border",
                            kpi.gradient,
                            kpi.borderColor
                        )}
                    >
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {kpi.title}
                            </CardTitle>
                            <Icon className={cn("h-4 w-4", kpi.iconColor)} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{kpi.value}</div>
                            {kpi.breakdown && (
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <span className="h-2 w-2 rounded-full bg-blue-500 inline-block" />
                                        FB: {kpi.breakdown.facebook.toLocaleString()}
                                    </span>
                                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <span className="h-2 w-2 rounded-full bg-pink-500 inline-block" />
                                        IG: {kpi.breakdown.instagram.toLocaleString()}
                                    </span>
                                </div>
                            )}
                            <div className="flex items-center gap-1 mt-1">
                                <ChangeIcon
                                    className={cn(
                                        "h-3 w-3",
                                        isPositive ? "text-green-500" : "text-red-500"
                                    )}
                                />
                                <span
                                    className={cn(
                                        "text-xs font-medium",
                                        isPositive ? "text-green-500" : "text-red-500"
                                    )}
                                >
                                    {Math.abs(kpi.change)}%
                                </span>
                                <span className="text-xs text-muted-foreground">from last month</span>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
        </div>
    )
}
