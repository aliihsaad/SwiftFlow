"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
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
    MessageCircle,
    Inbox,
    Zap,
    Menu,
} from "lucide-react"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import { Workspace } from "@/types/workspace"

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

interface MobileNavProps {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
}

export function MobileNav({ activeWorkspace, workspaces }: MobileNavProps) {
    const pathname = usePathname()
    const [open, setOpen] = useState(false)
    const [mounted, setMounted] = useState(false)

    // Only render portal on client
    useEffect(() => { setMounted(true) }, [])

    const NavLink = ({ item }: { item: { icon: React.ElementType; label: string; href: string } }) => {
        const isActive = pathname === item.href
        const Icon = item.icon
        return (
            <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    isActive
                        ? "text-white"
                        : "text-white/45 hover:text-white/75",
                )}
                style={isActive ? { background: 'rgba(139,92,246,0.1)' } : undefined}
            >
                {isActive && (
                    <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-[18px] rounded-full"
                        style={{ background: 'rgba(139,92,246,0.85)' }}
                    />
                )}
                <Icon
                    className={cn(
                        "h-[17px] w-[17px] shrink-0",
                        isActive ? "text-violet-400" : "text-white/35"
                    )}
                />
                <span>{item.label}</span>
            </Link>
        )
    }

    // The backdrop + drawer rendered via portal at document.body so they
    // are never trapped inside a parent stacking context (e.g. the AI chat
    // container creates one via overflow+shadow on the assistant page).
    const overlay = mounted ? createPortal(
        <>
            {/* Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
                    open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                )}
                style={{ zIndex: 9998 }}
                onClick={() => setOpen(false)}
            />

            {/* Slide-in drawer */}
            <div
                className={cn(
                    "fixed inset-y-0 left-0 flex w-[270px] flex-col transition-transform duration-300 ease-in-out",
                    open ? "translate-x-0" : "-translate-x-full"
                )}
                style={{
                    zIndex: 9999,
                    background: 'oklch(0.115 0.013 275)',
                    borderRight: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: '8px 0 32px rgba(0,0,0,0.6)',
                }}
            >
                {/* Drawer header — workspace switcher */}
                <div
                    className="shrink-0 px-3 pt-3 pb-2"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                    <WorkspaceSwitcher
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaces}
                        isCollapsed={false}
                    />
                </div>

                {/* Nav content */}
                <div className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
                    {/* Create Post CTA */}
                    <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                        <button
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white transition-all duration-150 hover:opacity-85 active:scale-[0.98]"
                            style={{
                                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                boxShadow: '0 2px 16px rgba(124,58,237,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                            }}
                            onClick={() => setOpen(false)}
                        >
                            <PenSquare className="h-4 w-4 shrink-0" />
                            <span>Create Post</span>
                        </button>
                    </CreatePostTrigger>

                    {/* Primary nav */}
                    <div className="space-y-px">
                        {primaryNav.map((item, i) => (
                            <NavLink key={i} item={item} />
                        ))}
                    </div>

                    {/* Divider */}
                    <div className="mx-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />

                    {/* Secondary nav */}
                    <div className="space-y-px">
                        {secondaryNav.map((item, i) => (
                            <NavLink key={i} item={item} />
                        ))}
                    </div>
                </div>

                {/* Footer: Logout */}
                <div
                    className="shrink-0 px-2 py-3"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                >
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
                </div>
            </div>
        </>,
        document.body
    ) : null

    return (
        <>
            {/* Hamburger trigger — stays in the header */}
            <button
                onClick={() => setOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.55)' }}
                aria-label="Open menu"
            >
                <Menu className="h-5 w-5" />
            </button>

            {overlay}
        </>
    )
}
