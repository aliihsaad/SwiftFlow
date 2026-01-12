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
import { MoreHorizontal, LogOut, Settings as SettingsIcon, Trash2 } from "lucide-react"
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
        } catch (error: any) {
            toast.error(error.message || "Failed to rename workspace")
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
        } catch (error: any) {
            toast.error(error.message || "Failed to delete workspace")
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
        } catch (error: any) {
            toast.error(error.message || "Failed to leave workspace")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Workspaces</h3>
                <Button onClick={() => setIsAddOpen(true)}>Add Workspace</Button>
            </div>

            <div className="rounded-md border">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {workspaces.map((ws) => (
                            <TableRow key={ws.id}>
                                <TableCell className="font-medium">{ws.name}</TableCell>
                                <TableCell className="capitalize">{ws.role}</TableCell>
                                <TableCell>{new Date(ws.created_at).toLocaleDateString("en-US")}</TableCell>
                                <TableCell>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                                <MoreHorizontal className="h-4 w-4" />
                                                <span className="sr-only">Actions</span>
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            {ws.role === 'owner' && (
                                                <DropdownMenuItem onClick={() => handleRenameClick(ws)}>
                                                    <SettingsIcon className="mr-2 h-4 w-4" /> Rename
                                                </DropdownMenuItem>
                                            )}
                                            {ws.role === 'owner' ? (
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={() => handleDeleteClick(ws)}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                </DropdownMenuItem>
                                            ) : (
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
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
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Workspace</DialogTitle>
                        <DialogDescription>
                            Enter a new name for "{selectedWorkspace?.name}"
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleRenameSubmit}>
                        <div className="grid gap-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="new-name">New Name</Label>
                                <Input
                                    id="new-name"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    placeholder="Workspace name"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsRenameOpen(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading || !newName.trim()}>
                                {isLoading ? "Renaming..." : "Rename"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Workspace Confirmation */}
            <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{selectedWorkspace?.name}"? This action cannot be undone.
                            All posts, analytics, and social connections will be permanently deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteConfirm}
                            disabled={isLoading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isLoading ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Leave Workspace Confirmation */}
            <AlertDialog open={isLeaveOpen} onOpenChange={setIsLeaveOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Leave Workspace?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to leave "{selectedWorkspace?.name}"?
                            You will lose access to all workspace content and will need to be re-invited by the owner.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleLeaveConfirm}
                            disabled={isLoading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isLoading ? "Leaving..." : "Leave"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
