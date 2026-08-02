"use client"

import { useState } from "react"
import { Activity, Bell, CheckCircle2, CircleAlert } from "lucide-react"

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"

export type RecentAction = {
    id: string
    type: "automation_started" | "automation_completed" | "automation_failed"
    description: string
    timestamp: string
}

const typeConfig: Record<RecentAction["type"], {
    icon: typeof Activity
    color: string
    background: string
}> = {
    automation_started: {
        icon: Activity,
        color: "#67e8f9",
        background: "rgba(103,232,249,0.09)",
    },
    automation_completed: {
        icon: CheckCircle2,
        color: "#6ee7b7",
        background: "rgba(110,231,183,0.09)",
    },
    automation_failed: {
        icon: CircleAlert,
        color: "#fda4af",
        background: "rgba(253,164,175,0.09)",
    },
}

interface RecentActivityDropdownProps {
    activities: RecentAction[]
}

export function RecentActivityDropdown({ activities }: RecentActivityDropdownProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [seenCount, setSeenCount] = useState(0)
    const unreadCount = Math.max(0, activities.length - seenCount)

    const handleOpenChange = (open: boolean) => {
        setIsOpen(open)
        if (open) setSeenCount(activities.length)
    }

    return (
        <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-white/48 transition hover:border-cyan-300/20 hover:bg-cyan-300/[0.07] hover:text-cyan-100"
                    aria-label="Open recent automation activity"
                >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                    {unreadCount > 0 && !isOpen ? (
                        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-400 px-1 text-[8px] font-bold text-white">
                            {Math.min(unreadCount, 9)}
                        </span>
                    ) : null}
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
                align="end"
                className="w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-2xl border-white/[0.08] bg-[#11131c]/98 p-0 shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
            >
                <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                    <span className="text-sm font-semibold text-white/85">Automation activity</span>
                    <span className="rounded-full bg-cyan-300/[0.10] px-2 py-0.5 text-[10px] font-semibold text-cyan-200">
                        {activities.length}
                    </span>
                </div>

                <ScrollArea className="h-[340px]">
                    <div className="space-y-1 p-3">
                        {activities.length === 0 ? (
                            <div className="py-12 text-center text-sm text-white/28">
                                No recent automation runs
                            </div>
                        ) : activities.map((activity) => {
                            const config = typeConfig[activity.type]
                            const Icon = config.icon
                            return (
                                <div
                                    key={activity.id}
                                    className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/[0.03]"
                                >
                                    <div
                                        className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"
                                        style={{ background: config.background }}
                                    >
                                        <Icon className="h-4 w-4" style={{ color: config.color }} aria-hidden="true" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="line-clamp-2 text-sm leading-snug text-white/75">
                                            {activity.description}
                                        </p>
                                        <p className="mt-1 text-[11px] text-white/28">{activity.timestamp}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
