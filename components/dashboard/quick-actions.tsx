"use client"

import { useState } from "react"
import { Sparkles, Plus, BarChart, Bot } from "lucide-react"
import Link from "next/link"
import { CreatePostModal } from "@/components/create/create-post-modal"

interface QuickActionsProps {
    workspaceId?: string
    isReviewPhase1Release?: boolean
}

const actions = [
    {
        icon: Sparkles,
        label: "Generate Ideas",
        description: "AI content",
        href: "/dashboard/assistant",
        accent: '#22d3ee',
        glow: 'rgba(34,211,238,0.15)',
    },
    {
        icon: Plus,
        label: "Create Post",
        description: "New post",
        href: null,
        accent: '#fb7185',
        glow: 'rgba(251,113,133,0.15)',
    },
    {
        icon: BarChart,
        label: "Analytics",
        description: "View stats",
        href: "/dashboard/analytics",
        accent: '#f59e0b',
        glow: 'rgba(245,158,11,0.15)',
    },
    {
        icon: Bot,
        label: "AI Assistant",
        description: "Chat & ideas",
        href: "/dashboard/assistant",
        accent: '#84cc16',
        glow: 'rgba(132,204,22,0.15)',
    },
]

export function QuickActions({ workspaceId, isReviewPhase1Release = false }: QuickActionsProps) {
    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false)
    const visibleActions = isReviewPhase1Release
        ? actions.filter((action) => action.href !== "/dashboard/analytics")
        : actions

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {visibleActions.map((action) => {
                    const Icon = action.icon
                    const inner = (
                        <button
                            key={action.label}
                            className="group w-full flex flex-col items-center gap-3 rounded-xl p-4 transition-all duration-200 hover:translate-y-[-2px] active:scale-[0.97]"
                            style={{
                                background: '#151620',
                                border: `1px solid rgba(255,255,255,0.08)`,
                                boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.border = `1px solid ${action.glow.replace('0.15', '0.4')}`
                                e.currentTarget.style.boxShadow = `0 4px 20px ${action.glow}, 0 0 0 1px ${action.glow}`
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.border = `1px solid rgba(255,255,255,0.07)`
                                e.currentTarget.style.boxShadow = 'none'
                            }}
                            onClick={action.href ? undefined : () => setIsCreatePostModalOpen(true)}
                        >
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110"
                                style={{ background: `${action.accent}16` }}
                            >
                                <Icon className="h-5 w-5" style={{ color: action.accent }} />
                            </div>
                            <div className="text-center">
                                <div className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.8)' }}>
                                    {action.label}
                                </div>
                                <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                                    {action.description}
                                </div>
                            </div>
                        </button>
                    )

                    if (action.href) {
                        return <Link key={action.label} href={action.href}>{inner}</Link>
                    }
                    return inner
                })}
            </div>

            <CreatePostModal
                open={isCreatePostModalOpen}
                onOpenChange={setIsCreatePostModalOpen}
                workspaceId={workspaceId || ""}
            />
        </>
    )
}
