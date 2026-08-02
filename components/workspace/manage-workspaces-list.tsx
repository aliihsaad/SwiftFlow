"use client"

import { Workspace, WorkspaceRole } from "@/types/workspace"
import { Button } from "@/components/ui/button"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Building2, MoreHorizontal, LogOut, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AddWorkspaceModal } from "./add-workspace-modal"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { renameWorkspace, deleteWorkspace, leaveWorkspace } from "@/app/actions/workspace"
import { toast } from "sonner"

interface ManageWorkspacesListProps {
    workspaces: (Workspace & { role: WorkspaceRole })[]
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback
}

export function ManageWorkspacesList({ workspaces }: ManageWorkspacesListProps) {
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [isRenameOpen, setIsRenameOpen] = useState(false)
    const [isDeleteOpen, setIsDeleteOpen] = useState(false)
    const [isLeaveOpen, setIsLeaveOpen] = useState(false)
    const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace & { role: WorkspaceRole } | null>(null)
    const [newName, setNewName] = useState("")
    const [isLoading, setIsLoading] = useState(false)

    const router = useRouter()

    const handleRenameClick = (ws: Workspace & { role: WorkspaceRole }) => {
        setSelectedWorkspace(ws)
        setNewName(ws.name)
        setIsRenameOpen(true)
    }

    const handleDeleteClick = (ws: Workspace & { role: WorkspaceRole }) => {
        setSelectedWorkspace(ws)
        setIsDeleteOpen(true)
    }

    const handleLeaveClick = (ws: Workspace & { role: WorkspaceRole }) => {
        setSelectedWorkspace(ws)
        setIsLeaveOpen(true)
    }

    const handleRenameSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedWorkspace || !newName.trim()) return

        setIsLoading(true)
        try {
            await renameWorkspace(selectedWorkspace.id, newName.trim())
            toast.success(`Workspace renamed to "${newName}"`)
            setIsRenameOpen(false)
            router.refresh()
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to rename workspace"))
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteConfirm = async () => {
        if (!selectedWorkspace) return

        setIsLoading(true)
        try {
            await deleteWorkspace(selectedWorkspace.id)
            toast.success(`Workspace "${selectedWorkspace.name}" deleted`)
            setIsDeleteOpen(false)
            router.refresh()
            router.push('/dashboard')
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to delete workspace"))
        } finally {
            setIsLoading(false)
        }
    }

    const handleLeaveConfirm = async () => {
        if (!selectedWorkspace) return

        setIsLoading(true)
        try {
            await leaveWorkspace(selectedWorkspace.id)
            toast.success(`Left workspace "${selectedWorkspace.name}"`)
            setIsLeaveOpen(false)
            router.refresh()
            router.push('/dashboard')
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, "Failed to leave workspace"))
        } finally {
            setIsLoading(false)
        }
    }

    const panelClass = "rounded-[22px] border-white/10 bg-[#171925] text-white/80"
    const subtleBorder = "border-white/10"

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/8">
                        <Building2 className="h-4 w-4 text-cyan-100/80" aria-hidden="true" />
                    </span>
                    <div>
                        <h3 className="text-base font-medium text-white/90">Workspace directory</h3>
                        <p className="mt-0.5 text-xs text-white/40">{workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} available</p>
                    </div>
                </div>
                <Button
                    onClick={() => setIsAddOpen(true)}
                    className="w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20 sm:w-auto"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add Workspace
                </Button>
            </div>

            <div className={`overflow-hidden rounded-2xl border ${subtleBorder} bg-black/20`}>
                <Table className="min-w-[560px]">
                    <TableHeader>
                        <TableRow className="border-white/10 hover:bg-transparent">
                            <TableHead className="text-white/45">Name</TableHead>
                            <TableHead className="text-white/45">Role</TableHead>
                            <TableHead className="text-white/45">Created</TableHead>
                            <TableHead className="w-[50px] text-white/45"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {workspaces.map((ws) => (
                            <TableRow key={ws.id} className="border-white/5 hover:bg-white/5">
                                <TableCell className="max-w-[220px] truncate font-medium text-white/85">{ws.name}</TableCell>
                                <TableCell className="capitalize text-white/60">{ws.role}</TableCell>
                                <TableCell suppressHydrationWarning className="text-white/55">{new Date(ws.created_at).toLocaleDateString("en-US")}</TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-white/60 hover:bg-white/8 hover:text-white">
                                                <MoreHorizontal className="h-4 w-4" />
                                                <span className="sr-only">Actions</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="border-white/10 bg-[#1b1d28] text-white/80">
                                            {ws.role === 'owner' && (
                                                <DropdownMenuItem className="focus:bg-white/10 focus:text-white" onClick={() => handleRenameClick(ws)}>
                                                    <SettingsIcon className="mr-2 h-4 w-4" /> Rename
                                                </DropdownMenuItem>
                                            )}
                                            {ws.role === 'owner' ? (
                                                <DropdownMenuItem
                                                    className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
                                                    onClick={() => handleDeleteClick(ws)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
                                                    onClick={() => handleLeaveClick(ws)}
                                                >
                                                    <LogOut className="mr-2 h-4 w-4" /> Leave
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>

            {/* Add Workspace Modal */}
            <AddWorkspaceModal open={isAddOpen} onOpenChange={setIsAddOpen} />

            {/* Rename Workspace Dialog */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent className={panelClass}>
                    <DialogHeader>
                        <DialogTitle className="text-white/90">Rename Workspace</DialogTitle>
                        <DialogDescription className="text-white/50">
                            Enter a new name for &quot;{selectedWorkspace?.name}&quot;
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRenameSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="new-name" className="text-white/75">New Name</Label>
                                <Input
                                    id="new-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Workspace name"
                                    required
                                    disabled={isLoading}
                                    className="border-white/10 bg-black/20 text-white/85 placeholder:text-white/25"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsRenameOpen(false)}
                                disabled={isLoading}
                                className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={isLoading || !newName.trim()}
                                className="border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                            >
                                {isLoading ? "Renaming..." : "Rename"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Workspace Confirmation */}
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent className={panelClass}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete Workspace?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            Are you sure you want to delete &quot;{selectedWorkspace?.name}&quot;? This action cannot be undone.
                            All automations, analytics, team access, and social connections will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isLoading}
                            className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                        >
                            {isLoading ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Leave Workspace Confirmation */}
            <AlertDialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
                <AlertDialogContent className={panelClass}>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Leave Workspace?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            Are you sure you want to leave &quot;{selectedWorkspace?.name}&quot;?
                            You will lose access to all workspace content and will need to be re-invited by the owner.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleLeaveConfirm}
                            disabled={isLoading}
                            className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                        >
                            {isLoading ? "Leaving..." : "Leave"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
