"use client"

import { useState, useEffect } from "react"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { useToast } from "@/components/ui/use-toast"

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
    const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | undefined>(workspaceId)
    const { toast } = useToast()

    // Get workspace ID from cookies on client side
    useEffect(() => {
        if (!workspaceId) {
            const cookieWorkspaceId = getCookie("active_workspace_id")
            setActiveWorkspaceId(cookieWorkspaceId)
        }
    }, [workspaceId])

    const handleClick = () => {
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
            <div onClick={handleClick}>
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
