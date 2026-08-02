"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Loader2, Plus, Settings } from "lucide-react"
import { switchWorkspace } from "@/app/actions/workspace"
import { Workspace } from "@/types/workspace"
import { AddWorkspaceModal } from "@/components/workspace/add-workspace-modal"
import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type WorkspaceSwitcherProps = {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
    isCollapsed?: boolean
}

export function WorkspaceSwitcher({
    activeWorkspace,
    workspaces,
    isCollapsed = false,
}: WorkspaceSwitcherProps) {
    const [, startTransition] = useTransition()
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const [isSwitching, setIsSwitching] = useState(false)
    const router = useRouter()
    const initial = activeWorkspace?.name.charAt(0).toUpperCase() || "W"

    const handleSwitch = (workspaceId: string) => {
        if (workspaceId === activeWorkspace?.id) return
        setIsSwitching(true)
        startTransition(async () => {
            try {
                await switchWorkspace(workspaceId)
                window.location.href = window.location.pathname
            } catch (error) {
                console.error("Failed to switch workspace", error)
                setIsSwitching(false)
            }
        })
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size={isCollapsed ? "icon" : "default"}
                        className={cn(
                            "group border border-white/[0.07] bg-white/[0.025] text-white transition hover:border-white/[0.12] hover:bg-white/[0.055] hover:text-white",
                            isCollapsed
                                ? "mx-auto h-11 w-11 rounded-xl p-0"
                                : "h-[58px] w-full justify-between rounded-xl px-2.5",
                        )}
                        title={isCollapsed ? activeWorkspace?.name : undefined}
                        suppressHydrationWarning
                    >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-cyan-200/15 bg-linear-to-br from-cyan-300/20 to-violet-400/20 text-sm font-bold text-cyan-100">
                            {initial}
                        </span>

                        {isCollapsed ? null : (
                            <>
                                <span className="ml-3 min-w-0 flex-1 text-left">
                                    <span className="block truncate text-sm font-semibold tracking-[-0.01em] text-white/90">
                                        {activeWorkspace?.name || "Select workspace"}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.15em] text-white/28">
                                        Free workspace
                                    </span>
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-white/30 transition group-hover:text-white/55" />
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                    className="w-72 border-white/10 bg-[#121521]/98 p-2 text-white shadow-2xl backdrop-blur-xl"
                    align="start"
                    side={isCollapsed ? "right" : "bottom"}
                    sideOffset={8}
                >
                    <DropdownMenuLabel className="px-2 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/30">
                        Workspaces
                    </DropdownMenuLabel>
                    {workspaces.map((workspace) => {
                        const selected = activeWorkspace?.id === workspace.id
                        return (
                            <DropdownMenuItem
                                key={workspace.id}
                                onSelect={() => handleSwitch(workspace.id)}
                                className="min-h-12 cursor-pointer gap-3 rounded-xl px-2.5 text-white/70 focus:bg-white/[0.06] focus:text-white"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-xs font-bold text-white/70">
                                    {workspace.name.substring(0, 1).toUpperCase()}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{workspace.name}</span>
                                    <span className="text-[10px] text-white/30">Free workspace</span>
                                </span>
                                {selected ? <Check className="h-4 w-4 text-cyan-200" /> : null}
                            </DropdownMenuItem>
                        )
                    })}
                    <DropdownMenuSeparator className="bg-white/[0.07]" />
                    <DropdownMenuItem
                        className="min-h-10 cursor-pointer gap-2 rounded-lg text-white/55 focus:bg-white/[0.06] focus:text-white"
                        onSelect={() => setIsAddModalOpen(true)}
                    >
                        <Plus className="h-4 w-4" />
                        Add workspace
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="min-h-10 cursor-pointer gap-2 rounded-lg text-white/55 focus:bg-white/[0.06] focus:text-white"
                        onSelect={() => router.push("/dashboard/settings")}
                    >
                        <Settings className="h-4 w-4" />
                        Workspace settings
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AddWorkspaceModal open={isAddModalOpen} onOpenChange={setIsAddModalOpen} />

            {isSwitching ? (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-[#080a12]/85 backdrop-blur-xl">
                    <div className="sf-panel flex min-w-56 flex-col items-center gap-3 p-6">
                        <Loader2 className="h-7 w-7 animate-spin text-cyan-200" />
                        <div className="text-center">
                            <p className="text-sm font-semibold text-white">Switching workspace</p>
                            <p className="mt-1 text-xs text-white/45">Loading the latest workspace state…</p>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    )
}
