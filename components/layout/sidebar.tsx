"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, LogOut, PenSquare } from "lucide-react"
import { signOut } from "@/app/actions/auth"
import { CreatePostTrigger } from "@/components/create/create-post-trigger"
import {
    accountNavigation,
    engagementNavigation,
    getVisibleNavigation,
    isNavigationItemActive,
    type DashboardNavItem,
    workspaceNavigation,
} from "@/components/layout/dashboard-navigation"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Workspace } from "@/types/workspace"

type SidebarProps = {
    workspaces: Workspace[]
    activeWorkspace: Workspace | null
    isReviewPhase1Release: boolean
}

type SidebarLinkProps = {
    item: DashboardNavItem
    pathname: string
    isCollapsed: boolean
}

function SidebarLink({ item, pathname, isCollapsed }: SidebarLinkProps) {
    const active = isNavigationItemActive(pathname, item.href)
    const Icon = item.icon
    const link = (
        <Link
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
                "group relative flex min-h-10 items-center rounded-xl border text-sm font-medium transition-all duration-200",
                isCollapsed ? "mx-auto w-11 justify-center px-0" : "gap-3 px-3",
                active
                    ? "border-violet-300/15 bg-violet-400/[0.11] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "border-transparent text-white/48 hover:border-white/[0.06] hover:bg-white/[0.045] hover:text-white/82",
            )}
        >
            <span
                className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-linear-to-b from-cyan-300 to-violet-400 transition-opacity",
                    active && !isCollapsed ? "opacity-100" : "opacity-0",
                )}
            />
            <Icon
                className={cn(
                    "h-[17px] w-[17px] shrink-0 transition-colors",
                    active ? "text-cyan-200" : "text-white/38 group-hover:text-white/70",
                )}
                aria-hidden="true"
            />
            {isCollapsed ? null : <span className="truncate">{item.label}</span>}
        </Link>
    )

    if (!isCollapsed) return link

    return (
        <Tooltip>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">
                <p className="font-medium">{item.label}</p>
                <p className="mt-0.5 max-w-52 text-xs text-muted-foreground">{item.description}</p>
            </TooltipContent>
        </Tooltip>
    )
}

export function Sidebar({ workspaces, activeWorkspace, isReviewPhase1Release }: SidebarProps) {
    const pathname = usePathname()
    const [isCollapsed, setIsCollapsed] = useState(false)
    const sections = [
        {
            label: "Workspace",
            items: getVisibleNavigation(workspaceNavigation, isReviewPhase1Release),
        },
        {
            label: "Engage",
            items: getVisibleNavigation(engagementNavigation, isReviewPhase1Release),
        },
        {
            label: "Manage",
            items: getVisibleNavigation(accountNavigation, isReviewPhase1Release),
        },
    ]

    return (
        <TooltipProvider delayDuration={100}>
            <div
                className={cn(
                    "relative flex h-full shrink-0 flex-col border-r border-white/[0.07] bg-[#090b13]/95 transition-[width] duration-300",
                    isCollapsed ? "w-[84px]" : "w-[276px]",
                )}
            >
                <div className="flex h-[72px] shrink-0 items-center border-b border-white/[0.065] px-4">
                    <Link
                        href="/dashboard"
                        className={cn(
                            "flex min-w-0 items-center",
                            isCollapsed ? "mx-auto justify-center" : "gap-3",
                        )}
                        aria-label="SwiftFlow overview"
                    >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-white/[0.09] bg-black/30 shadow-[0_10px_28px_rgba(34,211,238,0.16)]">
                            <Image
                                src="/logo.png"
                                alt=""
                                width={40}
                                height={40}
                                className="h-full w-full object-cover"
                                priority
                            />
                        </span>
                        {isCollapsed ? null : (
                            <span className="min-w-0">
                                <span className="block text-[15px] font-bold tracking-[-0.025em] text-white">
                                    SwiftFlow
                                </span>
                                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                                    Social command center
                                </span>
                            </span>
                        )}
                    </Link>
                </div>

                <div className="shrink-0 border-b border-white/[0.055] p-3">
                    <WorkspaceSwitcher
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaces}
                        isCollapsed={isCollapsed}
                    />
                </div>

                <div className="flex-1 overflow-y-auto px-3 py-4">
                    <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                        <button
                            type="button"
                            className={cn(
                                "group mb-5 flex min-h-11 items-center justify-center rounded-xl border border-violet-300/20 bg-linear-to-r from-violet-600 to-indigo-600 font-semibold text-white shadow-[0_10px_30px_rgba(72,52,166,0.23)] transition hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0",
                                isCollapsed ? "mx-auto w-11 px-0" : "w-full gap-2.5 px-4 text-sm",
                            )}
                            aria-label="Create post"
                        >
                            <PenSquare className="h-4 w-4" aria-hidden="true" />
                            {isCollapsed ? null : <span>Create post</span>}
                        </button>
                    </CreatePostTrigger>

                    <nav className="space-y-5" aria-label="Primary navigation">
                        {sections.map((section) =>
                            section.items.length > 0 ? (
                                <section key={section.label}>
                                    {isCollapsed ? (
                                        <div className="mx-auto mb-2 h-px w-7 bg-white/[0.07]" />
                                    ) : (
                                        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.17em] text-white/25">
                                            {section.label}
                                        </p>
                                    )}
                                    <div className="space-y-1">
                                        {section.items.map((item) => (
                                            <SidebarLink
                                                key={item.href}
                                                item={item}
                                                pathname={pathname}
                                                isCollapsed={isCollapsed}
                                            />
                                        ))}
                                    </div>
                                </section>
                            ) : null,
                        )}
                    </nav>
                </div>

                <div className="shrink-0 border-t border-white/[0.06] p-3">
                    <button
                        type="button"
                        onClick={() => signOut()}
                        className={cn(
                            "flex min-h-10 items-center rounded-xl border border-transparent text-sm font-medium text-white/36 transition hover:border-rose-300/10 hover:bg-rose-400/[0.07] hover:text-rose-200",
                            isCollapsed ? "mx-auto w-11 justify-center" : "w-full gap-3 px-3",
                        )}
                        aria-label="Log out"
                    >
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {isCollapsed ? null : <span>Log out</span>}
                    </button>
                </div>

                <button
                    type="button"
                    className="absolute -right-3 top-[90px] z-40 flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-[#171a28] text-white/50 shadow-xl transition hover:scale-105 hover:text-white"
                    onClick={() => setIsCollapsed((collapsed) => !collapsed)}
                    aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    {isCollapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                </button>
            </div>
        </TooltipProvider>
    )
}
