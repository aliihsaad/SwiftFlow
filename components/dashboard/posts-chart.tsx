"use client"

import { useId } from "react"
import Link from "next/link"
import { ArrowUpRight, CalendarClock, Send } from "lucide-react"
import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts"

type PostsChartProps = {
    data: Array<{
        day: string
        scheduled: number
        posted: number
    }>
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

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
    if (!active || !payload?.length) return null

    return (
        <div className="min-w-40 rounded-xl border border-white/[0.09] bg-[#0b0e16]/95 px-3 py-2.5 shadow-[0_20px_55px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/32">{label}</p>
            <div className="space-y-1.5">
                {payload.map((entry) => (
                    <div key={entry.name} className="flex items-center gap-2 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
                        <span className="text-white/48">{entry.name}</span>
                        <span className="ml-auto font-semibold tabular-nums text-white/88">{entry.value}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

export function PostsChart({ data }: PostsChartProps) {
    const id = useId().replaceAll(":", "")
    const postedGradientId = `posted-${id}`
    const scheduledGradientId = `scheduled-${id}`
    const totals = data.reduce(
        (result, point) => ({
            posted: result.posted + point.posted,
            scheduled: result.scheduled + point.scheduled,
        }),
        { posted: 0, scheduled: 0 },
    )
    const hasActivity = totals.posted + totals.scheduled > 0

    return (
        <section className="overflow-hidden rounded-[24px] border border-white/[0.075] bg-[#10131d] shadow-[0_24px_70px_rgba(3,5,14,0.24)]" aria-labelledby="publishing-pulse-heading">
            <div className="flex flex-col gap-5 border-b border-white/[0.055] p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
                <div>
                    <span className="sf-kicker">Publishing pulse</span>
                    <h2 id="publishing-pulse-heading" className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white/92">
                        Past momentum and upcoming queue
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-white/36">A fourteen-day view of delivered and scheduled content.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <SummaryPill icon={Send} label="Published" value={totals.posted} tone="emerald" />
                    <SummaryPill icon={CalendarClock} label="Scheduled" value={totals.scheduled} tone="cyan" />
                    <Link
                        href="/dashboard/scheduled"
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 text-xs font-semibold text-white/48 transition hover:bg-white/[0.07] hover:text-white/78"
                    >
                        Open calendar
                        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                </div>
            </div>

            <div className="relative px-3 pb-4 pt-5 sm:px-5 sm:pb-5">
                {hasActivity ? null : (
                    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                        <div className="rounded-2xl border border-white/[0.07] bg-[#0d1018]/88 px-5 py-4 text-center backdrop-blur-md">
                            <p className="text-sm font-semibold text-white/68">Your publishing pulse starts here</p>
                            <p className="mt-1 text-xs text-white/32">Scheduled and published content will appear on this timeline.</p>
                        </div>
                    </div>
                )}

                <ResponsiveContainer width="100%" height={250} minWidth={0}>
                    <AreaChart data={data} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                        <defs>
                            <linearGradient id={postedGradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#6ee7b7" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id={scheduledGradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.28} />
                                <stop offset="100%" stopColor="#67e8f9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                            dataKey="day"
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                            minTickGap={16}
                            tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                        />
                        <YAxis
                            allowDecimals={false}
                            tickLine={false}
                            axisLine={false}
                            width={34}
                            tick={{ fill: "rgba(255,255,255,0.26)", fontSize: 10 }}
                        />
                        <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
                        <Area
                            type="monotone"
                            dataKey="posted"
                            name="Published"
                            stroke="#6ee7b7"
                            strokeWidth={2}
                            fill={`url(#${postedGradientId})`}
                            activeDot={{ r: 4, fill: "#6ee7b7", stroke: "#10131d", strokeWidth: 2 }}
                        />
                        <Area
                            type="monotone"
                            dataKey="scheduled"
                            name="Scheduled"
                            stroke="#67e8f9"
                            strokeWidth={2}
                            fill={`url(#${scheduledGradientId})`}
                            activeDot={{ r: 4, fill: "#67e8f9", stroke: "#10131d", strokeWidth: 2 }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </section>
    )
}

function SummaryPill({
    icon: Icon,
    label,
    value,
    tone,
}: {
    icon: typeof Send
    label: string
    value: number
    tone: "emerald" | "cyan"
}) {
    const styles = tone === "emerald"
        ? "border-emerald-300/12 bg-emerald-300/[0.06] text-emerald-200"
        : "border-cyan-300/12 bg-cyan-300/[0.06] text-cyan-200"

    return (
        <div className={`flex h-9 items-center gap-2 rounded-xl border px-3 ${styles}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-[11px] font-medium text-white/42">{label}</span>
            <span className="text-xs font-bold tabular-nums">{value}</span>
        </div>
    )
}
