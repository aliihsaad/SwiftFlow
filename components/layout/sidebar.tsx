"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
    ChevronRight
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

const sidebarItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: CalendarDays, label: "Scheduled", href: "/dashboard/scheduled" },
    { icon: Bot, label: "AI Assistant", href: "/dashboard/assistant" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
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

    return (
        <TooltipProvider delayDuration={0}>
            <div
                className={cn(
                    "flex h-full flex-col bg-background border-r border-border/40 transition-all duration-300 ease-in-out relative group",
                    isCollapsed ? "w-20" : "w-64"
                )}
            >
                {/* Header / Workspace Switcher */}
                <div className="flex-none p-4 border-b border-border/40">
                    <WorkspaceSwitcher
                        activeWorkspace={activeWorkspace}
                        workspaces={workspaces}
                        isCollapsed={isCollapsed}
                    />
                </div>

                {/* Navigation */}
                <div className="flex-1 overflow-y-auto py-6 px-3">
                    <nav className="grid gap-1.5">
                        {/* Create Post Modal Trigger */}
                        {isCollapsed ? (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                                        <Button
                                            variant="default"
                                            className="justify-center px-2 h-10 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white"
                                        >
                                            <PenSquare className="h-5 w-5 shrink-0" />
                                        </Button>
                                    </CreatePostTrigger>
                                </TooltipTrigger>
                                <TooltipContent side="right">Create Post</TooltipContent>
                            </Tooltip>
                        ) : (
                            <CreatePostTrigger workspaceId={activeWorkspace?.id}>
                                <Button
                                    variant="default"
                                    className="w-full justify-start gap-3 px-3 py-2.5 h-auto text-sm font-medium bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white shadow-lg shadow-purple-500/20"
                                >
                                    <PenSquare className="h-5 w-5 shrink-0" />
                                    <span className="truncate">Create Post</span>
                                </Button>
                            </CreatePostTrigger>
                        )}

                        {/* Regular Navigation Items */}
                        {sidebarItems.map((item, index) => {
                            const isActive = pathname === item.href
                            const LinkComponent = (
                                <Link
                                    href={item.href}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group/item",
                                        isActive
                                            ? "bg-primary/5 text-primary"
                                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                        isCollapsed && "justify-center px-2"
                                    )}
                                >
                                    <item.icon className={cn(
                                        "h-5 w-5 shrink-0 transition-colors",
                                        isActive ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"
                                    )} />
                                    {!isCollapsed && (
                                        <span className="truncate animate-in fade-in duration-200">
                                            {item.label}
                                        </span>
                                    )}
                                </Link>
                            )

                            if (isCollapsed) {
                                return (
                                    <Tooltip key={index}>
                                        <TooltipTrigger asChild>
                                            {LinkComponent}
                                        </TooltipTrigger>
                                        <TooltipContent side="right" className="flex items-center gap-4">
                                            {item.label}
                                        </TooltipContent>
                                    </Tooltip>
                                )
                            }

                            return <div key={index}>{LinkComponent}</div>
                        })}
                    </nav>
                </div>

                {/* Footer */}
                <div className="p-2 border-t border-border/40">
                    {isCollapsed ? (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    className="w-full justify-center h-10 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => signOut()}
                                >
                                    <LogOut className="h-5 w-5 shrink-0" />
                                    <span className="sr-only">Log Out</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">Log Out</TooltipContent>
                        </Tooltip>
                    ) : (
                        <Button
                            variant="ghost"
                            className="w-full justify-start gap-3 h-10 px-3 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => signOut()}
                        >
                            <LogOut className="h-5 w-5 shrink-0" />
                            <span className="font-medium">Log Out</span>
                        </Button>
                    )}
                </div>

                {/* Collapse Toggle Button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-md text-muted-foreground hover:text-foreground hidden group-hover:flex z-50"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                >
                    {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
                </Button>
            </div>
        </TooltipProvider>
    )
}
