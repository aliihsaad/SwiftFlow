import { Calendar, CheckCircle2, FileEdit, TrendingUp, TrendingDown, HelpCircle, Plus } from "lucide-react"
import Link from "next/link"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface MetricsProps {
    draftCount: number
    scheduledCount: number
    postedCount: number
    workspaceId: string
}

function Sparkline({ data, color }: { data: number[], color: string }) {
    const max = Math.max(...data)
    const min = Math.min(...data)
    const range = max - min || 1
    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * 100
        const y = 100 - ((d - min) / range) * 100
        return `${x},${y}`
    }).join(' ')

    return (
        <div className="h-8 w-24 opacity-60">
            <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" preserveAspectRatio="none">
                <polyline
                    points={points}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    )
}

function MetricCard({
    href,
    title,
    tooltip,
    count,
    trend,
    sparkData,
    sparkColor,
    accentColor,
    icon: Icon,
    isEmpty,
    workspaceId,
}: {
    href?: string
    title: string
    tooltip: string
    count: number
    trend: { value: number | string; isUp: boolean }
    sparkData: number[]
    sparkColor: string
    accentColor: { border: string; glow: string; icon: string; number: string; badge: string }
    icon: React.ElementType
    isEmpty?: boolean
    workspaceId?: string
}) {
    const cardContent = (
        <div
            className="group relative overflow-hidden rounded-xl p-5 transition-all duration-300 hover:translate-y-[-2px] cursor-pointer"
            style={{
                background: '#0e0d1c',
                border: `1px solid ${accentColor.border}`,
                boxShadow: `${accentColor.glow}, 0 1px 0 rgba(255,255,255,0.04) inset`,
            }}
        >
            {/* Ambient glow top-right */}
            <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity duration-300"
                style={{ background: accentColor.icon }}
            />

            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
                <TooltipProvider>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>
                            {title}
                        </span>
                        <Tooltip>
                            <TooltipTrigger>
                                <HelpCircle className="h-3 w-3" style={{ color: 'rgba(255,255,255,0.2)' }} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{tooltip}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>

                <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ background: `${accentColor.icon}18` }}
                >
                    <Icon className="h-4 w-4" style={{ color: accentColor.icon }} />
                </div>
            </div>

            {/* Count + trend */}
            {isEmpty ? (
                <CreatePostTrigger workspaceId={workspaceId}>
                    <button
                        className="w-full flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-all duration-150"
                        style={{
                            background: `${accentColor.icon}10`,
                            border: `1px dashed ${accentColor.border}`,
                            color: accentColor.icon,
                        }}
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Create First Post
                    </button>
                </CreatePostTrigger>
            ) : (
                <div className="flex items-end justify-between">
                    <div>
                        <div
                            className="text-3xl font-bold tracking-tight tabular-nums"
                            style={{ color: accentColor.number }}
                        >
                            {count}
                        </div>
                        <div className="mt-1.5 flex items-center gap-1">
                            {trend.isUp
                                ? <TrendingUp className="h-3 w-3 text-emerald-400" />
                                : <TrendingDown className="h-3 w-3 text-red-400" />
                            }
                            <span className="text-[11px] font-medium" style={{ color: trend.isUp ? '#34d399' : '#f87171' }}>
                                {trend.value}{typeof trend.value === 'number' ? '%' : ''}
                            </span>
                            <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.25)' }}>vs last week</span>
                        </div>
                    </div>
                    <Sparkline data={sparkData} color={sparkColor} />
                </div>
            )}
        </div>
    )

    if (href) {
        return <Link href={href}>{cardContent}</Link>
    }
    return cardContent
}

export function MetricsCards({ draftCount, scheduledCount, postedCount, workspaceId }: MetricsProps) {
    const isWorkspaceEmpty = (draftCount + scheduledCount + postedCount) === 0

    return (
        <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
                href="/dashboard/scheduled?tab=drafts"
                title="Drafts"
                tooltip="Posts awaiting completion or scheduling"
                count={draftCount}
                trend={{ value: 12, isUp: true }}
                sparkData={[2, 5, 3, 7, 4, 8, 6]}
                sparkColor="#f59e0b"
                accentColor={{
                    border: 'rgba(245,158,11,0.15)',
                    glow: '0 4px 24px rgba(245,158,11,0.06)',
                    icon: '#f59e0b',
                    number: '#fbbf24',
                    badge: 'rgba(245,158,11,0.1)',
                }}
                icon={FileEdit}
                isEmpty={isWorkspaceEmpty}
                workspaceId={workspaceId}
            />

            <MetricCard
                title="Scheduled"
                tooltip="Posts approved and waiting to publish"
                count={scheduledCount}
                trend={{ value: 5, isUp: true }}
                sparkData={[4, 2, 5, 3, 6, 4, 7]}
                sparkColor="#818cf8"
                accentColor={{
                    border: 'rgba(99,102,241,0.18)',
                    glow: '0 4px 24px rgba(99,102,241,0.07)',
                    icon: '#818cf8',
                    number: '#a5b4fc',
                    badge: 'rgba(99,102,241,0.1)',
                }}
                icon={Calendar}
                isEmpty={isWorkspaceEmpty}
                workspaceId={workspaceId}
            />

            <MetricCard
                title="Posted"
                tooltip="Total posts published to social platforms"
                count={postedCount}
                trend={{ value: 2, isUp: false }}
                sparkData={[1, 3, 2, 4, 5, 8, 9]}
                sparkColor="#34d399"
                accentColor={{
                    border: 'rgba(52,211,153,0.15)',
                    glow: '0 4px 24px rgba(52,211,153,0.06)',
                    icon: '#34d399',
                    number: '#6ee7b7',
                    badge: 'rgba(52,211,153,0.1)',
                }}
                icon={CheckCircle2}
                isEmpty={isWorkspaceEmpty}
                workspaceId={workspaceId}
            />
        </div>
    )
}
