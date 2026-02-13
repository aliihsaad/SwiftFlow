"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronsUpDown, Plus, Settings, Check, Loader2 } from "lucide-react"
import { Workspace } from "@/types/workspace"
import { switchWorkspace } from "@/app/actions/workspace"
import { AddWorkspaceModal } from "@/components/workspace/add-workspace-modal"
import { cn } from "@/lib/utils"

interface WorkspaceSwitcherProps {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
    onAddClick?: () => void
    isCollapsed?: boolean
}

export function WorkspaceSwitcher({ activeWorkspace, workspaces, isCollapsed }: WorkspaceSwitcherProps) {
    const [isPending, startTransition] = useTransition()
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isSwitching, setIsSwitching] = useState(false)
    const router = useRouter()

    const handleSwitch = (workspaceId: string) => {
        setIsSwitching(true)
        startTransition(async () => {
            try {
                await switchWorkspace(workspaceId)
                // Hard reload to clear URL params and refresh all data
                window.location.href = window.location.pathname
            } catch (error) {
                console.error("Failed to switch workspace", error)
                setIsSwitching(false)
            }
        })
    }

    // Get initials for avatar
    const initial = activeWorkspace?.name.charAt(0).toUpperCase() || "W"

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size={isCollapsed ? "icon" : "default"}
                        className={cn(
                            "w-full mb-2 transition-all duration-200",
                            isCollapsed
                                ? "h-10 w-10 p-0 rounded-lg bg-primary/10 hover:bg-primary/20"
                                : "h-14 px-3 justify-between hover:bg-accent border border-transparent hover:border-border/50"
                        )}
                        title={isCollapsed ? activeWorkspace?.name : undefined}
                        suppressHydrationWarning
                    >
                        {/* Avatar / Icon */}
                        <div className={cn(
                            "flex items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shrink-0 transition-all",
                            isCollapsed ? "h-6 w-6 text-xs" : "h-8 w-8 text-sm"
                        )}>
                            {initial}
                        </div>

                        {/* Text Details (Hidden when collapsed) */}
                        {!isCollapsed && (
                            <div className="flex flex-col items-start gap-0.5 ml-3 flex-1 overflow-hidden">
                                <span className="text-sm font-semibold truncate w-full text-left">
                                    {activeWorkspace?.name || "Select Workspace"}
                                </span>
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                    Free Plan
                                </span>
                            </div>
                        )}

                        {/* Chevron (Hidden when collapsed) */}
                        {!isCollapsed && (
                            <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-50 ml-2" />
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start" side={isCollapsed ? "right" : "bottom"}>
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground uppercase tracking-wider">
                        Switch Workspace
                    </DropdownMenuLabel>
                    {workspaces.map((ws) => (
                        <DropdownMenuItem
                            key={ws.id}
                            onSelect={() => handleSwitch(ws.id)}
                            className="gap-3 cursor-pointer py-2"
                        >
                            <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary text-xs font-bold">
                                {ws.name.substring(0, 1).toUpperCase()}
                            </div>
                            <div className="flex flex-col gap-0.5 flex-1 overflow-hidden">
                                <span className="truncate font-medium">{ws.name}</span>
                                <span className="text-[10px] text-muted-foreground">Free Plan</span>
                            </div>
                            {activeWorkspace?.id === ws.id && <Check className="h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="gap-2 cursor-pointer text-muted-foreground"
                        onSelect={() => setIsAddModalOpen(true)}
                    >
                        <Plus className="h-4 w-4" />
                        Add Workspace
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        className="gap-2 cursor-pointer text-muted-foreground"
                        onSelect={() => router.push('/dashboard/settings')}
                    >
                        <Settings className="h-4 w-4" />
                        Manage Workspaces
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AddWorkspaceModal
                open={isAddModalOpen}
                onOpenChange={setIsAddModalOpen}
            />

            {/* Full-screen loading overlay when switching workspaces */}
            {isSwitching && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">Switching workspace...</p>
                    </div>
                </div>
            )}
        </>
    )
}
