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
import { ChevronsUpDown, Plus, Settings, Check } from "lucide-react"
import { Workspace } from "@/types/workspace"
import { switchWorkspace } from "@/app/actions/workspace"
import { AddWorkspaceModal } from "@/components/workspace/add-workspace-modal"

interface WorkspaceSwitcherProps {
    activeWorkspace: Workspace | null
    workspaces: Workspace[]
    onAddClick?: () => void
}

export function WorkspaceSwitcher({ activeWorkspace, workspaces }: WorkspaceSwitcherProps) {
    const [isPending, startTransition] = useTransition()
    const [isAddModalOpen, setIsAddModalOpen] = useState(false)
    const router = useRouter()

    const handleSwitch = (workspaceId: string) => {
        startTransition(async () => {
            try {
                await switchWorkspace(workspaceId)
                router.refresh() // Reload data for new context
            } catch (error) {
                console.error("Failed to switch workspace", error)
            }
        })
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full justify-between h-12 px-2 hover:bg-slate-800/50 mb-4 border border-slate-700/50"
                    >
                        <div className="flex flex-col items-start gap-1 overflow-hidden">
                            <span className="text-sm font-semibold truncate w-full text-left">
                                {activeWorkspace?.name || "Select Workspace"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {activeWorkspace ? 'Free Plan' : 'No Active Workspace'}
                            </span>
                        </div>
                        <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-64" align="start">
                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                        Switch Workspace
                    </DropdownMenuLabel>
                    {workspaces.map((ws) => (
                        <DropdownMenuItem
                            key={ws.id}
                            onSelect={() => handleSwitch(ws.id)}
                            className="gap-2 cursor-pointer"
                        >
                            <div className="flex items-center justify-center h-6 w-6 rounded bg-primary/10 text-primary text-xs font-medium">
                                {ws.name.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="truncate flex-1">{ws.name}</span>
                            {activeWorkspace?.id === ws.id && <Check className="h-4 w-4" />}
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
        </>
    )
}
