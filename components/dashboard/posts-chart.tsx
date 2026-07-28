"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"

interface PostsChartProps {
    data: {
        day: string
        scheduled: number
        posted: number
    }[]
}
type TooltipEntry = {
    name: string
    color: string
    value: number
}

type ChartTooltipProps = {
    active?: boolean
    payload?: TooltipEntry[]
    label?: string
}


function CustomTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length) return null
    return (
        <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
                background: 'rgba(15,14,28,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
            }}
        >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {label}
            </p>
            {payload.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                    <span style={{ color: 'rgba(255,255,255,0.6)' }}>{entry.name}</span>
                    <span className="ml-auto font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {entry.value}
                    </span>
                </div>
            ))}
        </div>
    )
}

export function PostsChart({ data }: PostsChartProps) {
    return (
        <div
            className="overflow-hidden rounded-xl"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 14px 34px rgba(0,0,0,0.16)',
            }}
        >
            {/* Header */}
            <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        Post Activity
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Last 7 days · Next 7 days
                    </p>
                </div>

                <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: '#84cc16' }} />
                        Posted
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: '#22d3ee' }} />
                        Scheduled
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="px-4 pb-4 pt-5">
                <ResponsiveContainer width="100%" height={180} minWidth={0}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gradPosted" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#84cc16" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#84cc16" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="gradScheduled" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.18} />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                            </linearGradient>
                        </defs>

                        <CartesianGrid
                            strokeDasharray="3 3"
                            vertical={false}
                            stroke="rgba(255,255,255,0.05)"
                        />

                        <XAxis
                            dataKey="day"
                            stroke="rgba(255,255,255,0.2)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dy={8}
                            tick={{ fill: 'rgba(255,255,255,0.35)' }}
                        />

                        <YAxis
                            stroke="rgba(255,255,255,0.2)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            width={30}
                            tick={{ fill: 'rgba(255,255,255,0.35)' }}
                        />

                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
                        />

                        <Area
                            type="monotone"
                            dataKey="posted"
                            name="Posted"
                            stroke="#84cc16"
                            strokeWidth={1.5}
                            fillOpacity={1}
                            fill="url(#gradPosted)"
                            dot={false}
                            activeDot={{ r: 3, fill: '#84cc16', strokeWidth: 0 }}
                        />

                        <Area
                            type="monotone"
                            dataKey="scheduled"
                            name="Scheduled"
                            stroke="#22d3ee"
                            strokeWidth={1.5}
                            fillOpacity={1}
                            fill="url(#gradScheduled)"
                            dot={false}
                            activeDot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    )
}
