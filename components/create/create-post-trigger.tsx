"use client"

import { useState } from "react"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { useToast } from "@/components/ui/use-toast"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"

interface CreatePostTriggerProps {
    workspaceId?: string
    children?: React.ReactNode
}

function getCookie(name: string): string | undefined {
    if (typeof window === 'undefined') return undefined;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift();
}

export function CreatePostTrigger({ workspaceId, children }: CreatePostTriggerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const { toast } = useToast()
    const canWriteContent = useWorkspacePermission("content:write")
    const activeWorkspaceId = workspaceId || getCookie("active_workspace_id")

    const handleClick = () => {
        if (!canWriteContent) {
            toast({
                title: "Read-only role",
                description: "Your role can view this workspace but cannot create or edit posts.",
                variant: "destructive",
            })
            return
        }
        if (!activeWorkspaceId) {
            toast({
                title: "No workspace selected",
                description: "Please select a workspace to create a post",
                variant: "destructive"
            })
            return
        }
        setIsModalOpen(true)
    }

    return (
        <>
            <div
                onClick={handleClick}
                className={!canWriteContent ? "cursor-not-allowed opacity-70" : undefined}
                aria-disabled={!canWriteContent}
            >
                {children}
            </div>

            {activeWorkspaceId && (
                <CreatePostModal
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                    workspaceId={activeWorkspaceId}
                />
            )}
        </>
    )
}
