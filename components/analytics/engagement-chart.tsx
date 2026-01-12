"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FollowerGrowthData } from "@/types/analytics"
import { cn } from "@/lib/utils"

interface FollowerGrowthChartProps {
    data: FollowerGrowthData
}

export function FollowerGrowthChart({ data }: FollowerGrowthChartProps) {
    const chartData = data.labels.map((label, index) => ({
        label,
        followers: data.values[index],
    }))

    const platforms = [
        { name: 'Facebook', color: 'bg-blue-500' },
        { name: 'Instagram', color: 'bg-pink-500' },
    ]

    return (
        <Card className="col-span-full">
            <CardHeader>
                <CardTitle>Follower Growth</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                    Track your audience growth over time
                </p>
            </CardHeader>
            <CardContent>
                {/* Chart */}
                <div className="mb-6">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" opacity={0.3} />
                            <XAxis
                                dataKey="label"
                                stroke="currentColor"
                                className="text-muted-foreground"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                            />
                            <YAxis
                                stroke="currentColor"
                                className="text-muted-foreground"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                }}
                                labelStyle={{ color: 'hsl(var(--foreground))' }}
                            />
                            <Line
                                type="monotone"
                                dataKey="followers"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                dot={{ r: 4, fill: 'hsl(var(--primary))' }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>

                {/* Footer stats */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t">
                    <div className="flex flex-wrap items-center gap-6">
                        <div>
                            <p className="text-xs text-muted-foreground">Best Day</p>
                            <p className="text-sm font-semibold">{data.bestDay}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Avg. Daily</p>
                            <p className="text-sm font-semibold text-green-500">{data.avgDaily}</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Total Gain</p>
                            <p className="text-sm font-semibold text-green-500">{data.totalGain}</p>
                        </div>
                    </div>

                    {/* Platform chips */}
                    <div className="flex items-center gap-2">
                        {platforms.map((platform) => (
                            <div
                                key={platform.name}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-xs font-medium"
                            >
                                <div className={cn("h-2 w-2 rounded-full", platform.color)} />
                                {platform.name}
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
