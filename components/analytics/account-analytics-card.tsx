"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
            color: "text-blue-500",
        },
        {
            label: "Total Engagement",
            value: data.totalEngagement.toLocaleString(),
            icon: Activity,
            color: "text-purple-500",
        },
        {
            label: "Followers",
            value: data.followers.toLocaleString(),
            icon: Users,
            color: "text-green-500",
        },
    ]

    return (
        <Card>
            <CardHeader>
                <CardTitle>Account Analytics</CardTitle>
                <p className="text-sm text-muted-foreground">Last 30 days</p>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-3 gap-4">
                    {stats.map((stat) => {
                        const Icon = stat.icon
                        return (
                            <div key={stat.label} className="text-center space-y-2">
                                <div className="flex justify-center">
                                    <div className="p-2 rounded-full bg-secondary">
                                        <Icon className={`h-4 w-4 ${stat.color}`} />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{stat.value}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
