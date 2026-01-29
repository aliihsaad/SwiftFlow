"use client"

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FollowerGrowthData } from "@/types/analytics"

interface FollowerGrowthChartProps {
    data: FollowerGrowthData
}

export function FollowerGrowthChart({ data }: FollowerGrowthChartProps) {
    const chartData = data.labels.map((label, index) => ({
        label,
        total: data.values[index],
        facebook: data.facebookValues?.[index] ?? 0,
        instagram: data.instagramValues?.[index] ?? 0,
    }))

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
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: 'hsl(var(--card))',
                                    border: '1px solid hsl(var(--border))',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                }}
                                labelStyle={{ color: 'hsl(var(--foreground))' }}
                                formatter={(value?: number, name?: string) => {
                                    const label = name === 'facebook' ? 'Facebook' : name === 'instagram' ? 'Instagram' : 'Total'
                                    return [(value ?? 0).toLocaleString(), label]
                                }}
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                iconSize={8}
                                formatter={(value: string) =>
                                    value === 'facebook' ? 'Facebook' : value === 'instagram' ? 'Instagram' : 'Total'
                                }
                            />
                            <Line
                                type="monotone"
                                dataKey="facebook"
                                stroke="#3b82f6"
                                strokeWidth={2}
                                dot={{ r: 4, fill: '#3b82f6' }}
                                activeDot={{ r: 6 }}
                            />
                            <Line
                                type="monotone"
                                dataKey="instagram"
                                stroke="#ec4899"
                                strokeWidth={2}
                                dot={{ r: 4, fill: '#ec4899' }}
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
                </div>
            </CardContent>
        </Card>
    )
}
