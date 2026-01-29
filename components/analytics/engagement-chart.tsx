"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
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
        <Card className="col-span-full border-none shadow-md bg-linear-to-br from-card to-card/50">
            <CardHeader>
                <CardTitle>Audience Growth</CardTitle>
                <CardDescription>
                    Track how your audience is growing across platforms
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorFacebook" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorInstagram" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#ec4899" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                            <XAxis
                                dataKey="label"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                dy={10}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`}
                                dx={-10}
                            />
                            <Tooltip
                                cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                                content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        return (
                                            <div className="rounded-lg border bg-background/95 backdrop-blur-sm p-4 shadow-xl ring-1 ring-black/5">
                                                <p className="mb-2 font-medium text-foreground">{label}</p>
                                                {payload.map((entry: any) => (
                                                    <div key={entry.name} className="flex items-center gap-2 text-sm">
                                                        <div
                                                            className="h-2 w-2 rounded-full"
                                                            style={{ backgroundColor: entry.color }}
                                                        />
                                                        <span className="capitalize text-muted-foreground">{entry.name === 'facebook' ? 'Facebook' : entry.name === 'instagram' ? 'Instagram' : entry.name}:</span>
                                                        <span className="font-semibold text-foreground">
                                                            {entry.value.toLocaleString()}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    }
                                    return null
                                }}
                            />
                            <Legend
                                verticalAlign="top"
                                align="right"
                                iconType="circle"
                                wrapperStyle={{ paddingBottom: '20px' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="facebook"
                                name="Facebook"
                                stroke="#3b82f6"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorFacebook)"
                            />
                            <Area
                                type="monotone"
                                dataKey="instagram"
                                name="Instagram"
                                stroke="#ec4899"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorInstagram)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Footer stats */}
                <div className="grid grid-cols-3 gap-4 pt-6 mt-4 border-t">
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Best Day</p>
                        <p className="text-lg font-bold">{data.bestDay}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Avg. Daily</p>
                        <p className="text-lg font-bold text-green-500">+{data.avgDaily}</p>
                    </div>
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Gain</p>
                        <p className="text-lg font-bold text-green-500">+{data.totalGain}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
