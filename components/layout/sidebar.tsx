"use client"

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
    Instagram,
    Facebook,
    LogOut,
    Sparkles
} from "lucide-react"

const sidebarItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
    { icon: PenSquare, label: "Create Post", href: "/dashboard/create" },
    { icon: CalendarDays, label: "Scheduled", href: "/dashboard/scheduled" },
    { icon: Bot, label: "AI Assistant", href: "/dashboard/assistant" },
    { icon: BarChart3, label: "Analytics", href: "/dashboard/analytics" },
    { icon: Sparkles, label: "Brand Profile", href: "/dashboard/settings/brand" },
    { icon: Settings, label: "Settings", href: "/dashboard/settings" },
]

import { Workspace } from "@/types/workspace"
import { WorkspaceSwitcher } from "@/components/layout/workspace-switcher"

// ... imports

interface SidebarProps {
    workspaces: Workspace[]
    activeWorkspace: Workspace | null
}

export function Sidebar({ workspaces, activeWorkspace }: SidebarProps) {
    const pathname = usePathname()

    return (
        <div className="flex h-full w-64 flex-col bg-background border-r border-border/50">
            <div className="flex h-16 items-center border-b px-4 border-border/50">
                <WorkspaceSwitcher
                    activeWorkspace={activeWorkspace}
                    workspaces={workspaces}
                />
            </div>
            <div className="flex-1 overflow-y-auto py-4">
                {/* ... existing nav logic ... */}
                <nav className="grid gap-1 px-2">
                    {sidebarItems.map((item, index) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={index}
                                href={item.href}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground",
                                    isActive
                                        ? "bg-primary/10 text-primary hover:bg-primary/15"
                                        : "text-muted-foreground"
                                )}
                            >
                                <item.icon className={cn("h-4 w-4", isActive && "text-primary")} />
                                {item.label}
                            </Link>
                        )
                    })}
                </nav>
            </div>
            {/* ... footer ... */}
            <div className="p-4 border-t border-border/50">
                <div className="flex items-center gap-3 rounded-lg bg-card p-3 border shadow-sm">
                    <div className="h-9 w-9 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">JD</span>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium">John Doe</p>
                        <p className="truncate text-xs text-muted-foreground">Pro Plan</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                        onClick={() => signOut()}
                        title="Sign Out"
                    >
                        <LogOut className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
