"use client"

import { Bell } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FileEdit, Send, Sparkles, CalendarClock, Ban } from "lucide-react"

export type RecentAction = {
    id: string
    type: 'draft' | 'published' | 'scheduled' | 'ai_generated' | 'failed'
    description: string
    timestamp: string
}

const typeConfig: Record<RecentAction['type'], { icon: React.ElementType; color: string; bg: string }> = {
    draft:        { icon: FileEdit,      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    published:    { icon: Send,          color: '#34d399', bg: 'rgba(52,211,153,0.1)' },
    scheduled:    { icon: CalendarClock, color: '#818cf8', bg: 'rgba(129,140,248,0.1)' },
    ai_generated: { icon: Sparkles,      color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
    failed:       { icon: Ban,           color: '#f87171', bg: 'rgba(248,113,113,0.1)' },
}

interface RecentActivityDropdownProps {
    activities: RecentAction[]
}

export function RecentActivityDropdown({ activities }: RecentActivityDropdownProps) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150"
                    style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.5)',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(139,92,246,0.12)'
                        e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'
                        e.currentTarget.style.color = '#a78bfa'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                    }}
                >
                    <Bell className="h-4 w-4" />
                    {activities.length > 0 && (
                        <span
                            className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                            style={{ background: '#7c3aed' }}
                        >
                            {Math.min(activities.length, 9)}
                        </span>
                    )}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="p-0 w-[360px] rounded-xl overflow-hidden"
                style={{
                    background: 'rgba(12,11,22,0.98)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 24px 48px rgba(0,0,0,0.7)',
                }}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                        Recent Activity
                    </span>
                    <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}
                    >
                        {activities.length}
                    </span>
                </div>

                <ScrollArea className="h-[340px]">
                    <div className="p-3 space-y-1">
                        {activities.length === 0 ? (
                            <div className="py-12 text-center text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                No recent activity
                            </div>
                        ) : (
                            activities.map((activity) => {
                                const cfg = typeConfig[activity.type] ?? typeConfig.ai_generated
                                const Icon = cfg.icon
                                return (
                                    <div
                                        key={activity.id}
                                        className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors duration-100"
                                        style={{ cursor: 'default' }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    >
                                        <div
                                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                                            style={{ background: cfg.bg }}
                                        >
                                            <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm leading-snug truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>
                                                {activity.description}
                                            </p>
                                            <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.28)' }}>
                                                {activity.timestamp}
                                            </p>
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
