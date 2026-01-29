"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FollowerGrowthData } from "@/types/analytics"
import { TrendingUp, Calendar, BarChart3 } from "lucide-react"

interface FollowerGrowthChartProps {
    data: FollowerGrowthData
}

export function FollowerGrowthChart({ data }: FollowerGrowthChartProps) {
    const chartData = data.labels.map((label, index) => ({
        label,
        facebook: data.facebookValues?.[index] ?? 0,
        instagram: data.instagramValues?.[index] ?? 0,
    }))

    return (
        <Card className="col-span-full overflow-hidden">
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-lg font-semibold">Follower Growth</CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            Track your audience growth across platforms
                        </p>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5">
                            <span className="h-3 w-3 rounded-full bg-blue-500" />
                            <span className="text-muted-foreground">Facebook</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="h-3 w-3 rounded-full bg-pink-500" />
                            <span className="text-muted-foreground">Instagram</span>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {/* Chart */}
                <div className="h-[320px] w-full -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradFacebook" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.0} />
                                </linearGradient>
                                <linearGradient id="gradInstagram" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ec4899" stopOpacity={0.25} />
                                    <stop offset="100%" stopColor="#ec4899" stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid
                                strokeDasharray="3 3"
                                vertical={false}
                                stroke="hsl(var(--border))"
                                opacity={0.5}
                            />
                            <XAxis
                                dataKey="label"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                dy={8}
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`}
                                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                                width={45}
                            />
                            <Tooltip
                                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-lg border bg-popover/95 backdrop-blur-sm px-3 py-2.5 shadow-xl">
                                                <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
                                                {payload.map((entry: any) => (
                                                    <div key={entry.name} className="flex items-center justify-between gap-6 text-sm">
                                                        <div className="flex items-center gap-1.5">
                                                            <span
                                                                className="h-2 w-2 rounded-full"
                                                                style={{ backgroundColor: entry.color }}
                                                            />
                                                            <span className="text-muted-foreground">
                                                                {entry.name === 'facebook' ? 'Facebook' : 'Instagram'}
                                                            </span>
                                                        </div>
                                                        <span className="font-semibold tabular-nums">
                                                            {(entry.value ?? 0).toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="facebook"
                                name="facebook"
                                stroke="#3b82f6"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#gradFacebook)"
                                dot={false}
                                activeDot={{ r: 5, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="instagram"
                                name="instagram"
                                stroke="#ec4899"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#gradInstagram)"
                                dot={false}
                                activeDot={{ r: 5, fill: '#ec4899', stroke: '#fff', strokeWidth: 2 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Footer stats */}
                <div className="grid grid-cols-3 gap-4 pt-4 mt-2 border-t">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-secondary">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Best Day</p>
                            <p className="text-sm font-semibold">{data.bestDay || '—'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-secondary">
                            <BarChart3 className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Avg. Daily</p>
                            <p className="text-sm font-semibold text-green-500">{data.avgDaily}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-secondary">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Total Gain</p>
                            <p className="text-sm font-semibold text-green-500">{data.totalGain}</p>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
