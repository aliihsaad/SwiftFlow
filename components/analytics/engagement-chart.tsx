"use client"

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts"
import { FollowerGrowthData } from "@/types/analytics"
import { TrendingUp, Calendar, BarChart3, Info } from "lucide-react"

type TooltipEntry = {
    name: string
    color: string
    value?: number
}

type ChartTooltipProps = {
    active?: boolean
    payload?: TooltipEntry[]
    label?: string
}

function DarkTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length) return null
    return (
        <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
                background: 'rgba(17,17,24,0.98)',
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
                    <span style={{ color: 'rgba(255,255,255,0.55)' }}>Instagram</span>
                    <span className="ml-auto font-semibold tabular-nums" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        {(entry.value ?? 0).toLocaleString()}
                    </span>
                </div>
            ))}
        </div>
    )
}

export function FollowerGrowthChart({ data }: { data: FollowerGrowthData }) {
    let chartData = data.labels.map((label, index) => ({
        label,
        instagram: data.instagramValues?.[index] ?? data.values?.[index] ?? 0,
    }))

    if (chartData.length === 1) {
        chartData = [
            { label: '', instagram: 0 },
            { label: '', instagram: 0 },
            { label: '', instagram: 0 },
            { label: '', instagram: 0 },
            chartData[0],
        ]
    } else if (chartData.length === 2) {
        chartData = [
            { label: '', instagram: 0 },
            { label: '', instagram: 0 },
            ...chartData,
        ]
    }

    return (
        <div
            className="col-span-full overflow-hidden rounded-xl"
            style={{
                background: '#151620',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 14px 34px rgba(0,0,0,0.16)',
            }}
        >
            <div
                className="flex items-center justify-between px-6 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
            >
                <div>
                    <h3 className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        Follower Growth
                    </h3>
                    <p className="mt-0.5 text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        Track your Instagram audience growth
                    </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: '#fb7185' }} />
                    Instagram
                </div>
            </div>

            <div className="px-4 pb-4 pt-5">
                {data.labels.length <= 1 ? (
                    <div
                        className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                        style={{ background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', color: '#67e8f9' }}
                    >
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        <span>Limited data available. The chart will fill in as more daily syncs run.</span>
                    </div>
                ) : null}

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gradInstagram" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#fb7185" stopOpacity={0.22} />
                                    <stop offset="100%" stopColor="#fb7185" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                            <XAxis
                                dataKey="label"
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
                                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`}
                                tick={{ fill: 'rgba(255,255,255,0.35)' }}
                                width={45}
                            />
                            <Tooltip content={<DarkTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                            <Area
                                type="monotone"
                                dataKey="instagram"
                                name="instagram"
                                stroke="#fb7185"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#gradInstagram)"
                                dot={false}
                                activeDot={{ r: 4, fill: '#fb7185', strokeWidth: 0 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {[
                        { icon: Calendar, label: 'Best Day', value: data.bestDay || '—', color: '#22d3ee' },
                        { icon: BarChart3, label: 'Avg. Daily', value: data.avgDaily, color: '#f59e0b' },
                        { icon: TrendingUp, label: 'Total Gain', value: data.totalGain, color: '#84cc16' },
                    ].map(({ icon: Icon, label, value, color }) => (
                        <div key={label} className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${color}14` }}>
                                <Icon className="h-4 w-4" style={{ color }} />
                            </div>
                            <div>
                                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                                <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
