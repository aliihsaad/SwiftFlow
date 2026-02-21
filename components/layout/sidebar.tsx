"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { signOut } from "@/app/actions/auth"
import {
    LayoutDashboard,
    PenSquare,
    CalendarDays,
    Bot,
    BarChart3,
    Settings,
    LogOut,
    Sparkles,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    Inbox,
    Zap,
} from "lucide-react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import { Workspace } from "@/types/workspace"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"

const primaryNav = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CalendarDays, label: "Scheduled", href: "/dashboard/scheduled" },
    { icon: Bot, label: "AI Assistant", href: "/dashboard/assistant" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: MessageCircle, label: "Posts", href: "/dashboard/comments" },
    { icon: Inbox, label: "Messages", href: "/dashboard/messages" },
    { icon: Zap, label: "Automation", href: "/dashboard/automation" },
]

const secondaryNav = [
    { icon: Sparkles, label: "Brand Profile", href: "/dashboard/settings/brand" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
]

interface SidebarProps {
    workspaces: Workspace[]
    activeWorkspace: Workspace | null
}

export function Sidebar({ workspaces, activeWorkspace }: SidebarProps) {
    const pathname = usePathname()
    const [isCollapsed, setIsCollapsed] = useState(false)

    const renderNavItem = (item: { icon: React.ElementType; label: string; href: string }, index: number) => {
        const isActive = pathname === item.href
        const Icon = item.icon

        const linkEl = (
            <Link
                href={item.href}
                className={cn(
                    "group/item relative flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-150 overflow-hidden",
                    isCollapsed
                        ? "h-9 w-9 justify-center mx-auto"
                        : "px-3 py-2.5 w-full",
                    isActive
                        ? "text-white"
                        : "text-white/38 hover:text-white/75",
                )}
            >
                {/* Active background fill */}
                {isActive && (
                    <span
                        className="absolute inset-0 rounded-lg"
                        style={{ background: 'rgba(139,92,246,0.1)' }}
                    />
                )}

                {/* Hover background fill */}
                <span
                    className={cn(
                        "absolute inset-0 rounded-lg transition-opacity duration-150",
                        isActive ? "opacity-0" : "opacity-0 group-hover/item:opacity-100"
                    )}
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                />

                {/* Active left indicator bar */}
                {isActive && !isCollapsed && (
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full"
                        style={{ background: 'rgba(139,92,246,0.85)' }}
                    />
                )}

                <Icon
                    className={cn(
                        "relative z-10 h-[17px] w-[17px] shrink-0 transition-colors duration-150",
                        isActive
                            ? "text-violet-400"
                            : "text-white/35 group-hover/item:text-white/65",
                    )}
                />

                {!isCollapsed && (
                    <span className="relative z-10 truncate">
                        {item.label}
                    </span>
                )}
            </Link>
        )

        if (isCollapsed) {
            return (
                <Tooltip key={index}>
                    <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium text-xs">
                        {item.label}
                    </TooltipContent>
                </Tooltip>
            )
        }

        return <div key={index}>{linkEl}</div>
    }

    return (
        <TooltipProvider delayDuration={0}>
            <div
                className={cn(
                    "relative flex h-full flex-col transition-all duration-300 ease-in-out shrink-0",
                    isCollapsed ? "w-[60px]" : "w-[232px]",
                )}
                style={{
                    background: 'oklch(0.115 0.013 275)',
                    borderRight: '1px solid rgba(255,255,255,0.055)',
                }}
            >
                {/* Workspace switcher area */}
                <div
                    className="shrink-0 px-3 pt-4 pb-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <WorkspaceSwitcher
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaces}
                        isCollapsed={isCollapsed}
                    />
                </div>

                {/* Scrollable nav area */}
                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-3">

                    {/* Create Post CTA */}
                    {isCollapsed ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                                    <button
                                        className="h-9 w-9 mx-auto flex items-center justify-center rounded-lg transition-all duration-150 hover:opacity-85 active:scale-95"
                                        style={{
                                            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                            boxShadow: '0 2px 12px rgba(124,58,237,0.3)',
                                        }}
                                    >
                                        <PenSquare className="h-4 w-4 text-white shrink-0" />
                                    </button>
                                </CreatePostTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="font-medium text-xs">
                                Create Post
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                            <button
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-85 active:scale-[0.98]"
                                style={{
                                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                    boxShadow: '0 2px 16px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                                }}
                            >
                                <PenSquare className="h-4 w-4 shrink-0" />
                                <span>Create Post</span>
                            </button>
                        </CreatePostTrigger>
                    )}

                    {/* Primary nav */}
                    <div className="space-y-px">
                        {primaryNav.map((item, i) => renderNavItem(item, i))}
                    </div>

                    {/* Divider */}
                    <div
                        className="mx-1 h-px"
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                    />

                    {/* Secondary nav */}
                    <div className="space-y-px">
                        {secondaryNav.map((item, i) => renderNavItem(item, i + primaryNav.length))}
                    </div>
                </div>

                {/* Footer: Logout */}
                <div
                    className="shrink-0 px-2 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                >
                    {isCollapsed ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    className="h-9 w-9 mx-auto flex items-center justify-center rounded-lg transition-all duration-150"
                                    style={{ color: 'rgba(255,255,255,0.28)' }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.color = '#f87171'
                                        e.currentTarget.style.background = 'rgba(239,68,68,0.08)'
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.color = 'rgba(255,255,255,0.28)'
                                        e.currentTarget.style.background = 'transparent'
                                    }}
                                    onClick={() => signOut()}
                                >
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="font-medium text-xs">
                                Log Out
                            </TooltipContent>
                        </Tooltip>
                    ) : (
                        <button
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150"
                            style={{ color: 'rgba(255,255,255,0.28)' }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = '#f87171'
                                e.currentTarget.style.background = 'rgba(239,68,68,0.07)'
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.28)'
                                e.currentTarget.style.background = 'transparent'
                            }}
                            onClick={() => signOut()}
                        >
                            <LogOut className="h-4 w-4 shrink-0" />
                            <span>Log Out</span>
                        </button>
                    )}
                </div>

                {/* Collapse toggle */}
                <button
                    className="absolute -right-3 top-[68px] z-50 flex h-6 w-6 items-center justify-center rounded-full transition-all duration-150 hover:scale-110 active:scale-95"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    style={{
                        background: 'oklch(0.19 0.02 275)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                        color: 'rgba(255,255,255,0.4)',
                    }}
                >
                    {isCollapsed
                        ? <ChevronRight className="h-3 w-3" />
                        : <ChevronLeft className="h-3 w-3" />
                    }
                </button>
            </div>
        </TooltipProvider>
    )
}
