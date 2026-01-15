"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend } from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Define props for the chart
interface PostsChartProps {
    data: {
        day: string
        scheduled: number
        posted: number
    }[]
}


export function PostsChart({ data }: PostsChartProps) {
    return (
        <Card
            className="overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700"
            style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f9fafb 100%)',
            }}
        >
            <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                            Post Activity
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1.5">Track your posting performance over time</p>
                    </div>
                    <Tabs defaultValue="posts" className="w-[300px]">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="posts" className="text-xs font-medium">Posts</TabsTrigger>
                            <TabsTrigger value="engagement" className="text-xs font-medium">Engagement</TabsTrigger>
                            <TabsTrigger value="reach" className="text-xs font-medium">Reach</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
            </CardHeader>
            <CardContent className="pl-2 pr-4 pt-6">
                <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <defs>
                            <linearGradient id="colorPosted" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="colorScheduled" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="#e5e7eb"
                            opacity={0.6}
                        />
                        <XAxis
                            dataKey="day"
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            dy={8}
                        />
                        <YAxis
                            stroke="#6b7280"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `${value}`}
                            width={35}
                            allowDecimals={false}
                        />
                        <Tooltip
                            contentStyle={{
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                backgroundColor: '#ffffff',
                                padding: '12px'
                            }}
                            cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '5 5' }}
                        />
                        <Legend
                            iconType="circle"
                            wrapperStyle={{ paddingTop: '12px', fontSize: '13px' }}
                            iconSize={10}
                        />

                        {/* Current Period - Posted */}
                        <Area
                            type="monotone"
                            dataKey="posted"
                            name="Posted"
                            stroke="#10b981"
                            fillOpacity={1}
                            fill="url(#colorPosted)"
                            strokeWidth={2}
                        />

                        {/* Current Period - Scheduled */}
                        <Area
                            type="monotone"
                            dataKey="scheduled"
                            name="Scheduled"
                            stroke="#3b82f6"
                            fillOpacity={1}
                            fill="url(#colorScheduled)"
                            strokeWidth={2}
                        />


                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    )
}
