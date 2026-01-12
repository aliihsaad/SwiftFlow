"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { createWorkspace, switchWorkspace } from "@/app/actions/workspace"
import { toast } from "sonner"

interface AddWorkspaceModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function AddWorkspaceModal({ open, onOpenChange }: AddWorkspaceModalProps) {
    const [name, setName] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        try {
            const workspace = await createWorkspace(name)
            toast.success(`Workspace "${name}" created successfully!`)

            // Auto-switch is handled by createWorkspace (sets cookie)
            // await switchWorkspace(workspace.id)

            onOpenChange(false)
            setName("")
            router.refresh()
        } catch (error: any) {
            const errorMessage = error.message || "Failed to create workspace"
            toast.error(errorMessage)
            console.error(error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Create Workspace</DialogTitle>
                    <DialogDescription>
                        Add a new workspace to manage a different brand or client.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreate}>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="ws-name">Workspace Name</Label>
                            <Input
                                id="ws-name"
                                placeholder="Brand Name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={isLoading}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isLoading || !name}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
