"use client"

import { useState } from "react"
import { CreatePostModal } from "@/components/create/create-post-modal"

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

    // Get workspace ID from cookies if not provided
    const activeWorkspaceId = workspaceId || getCookie("active_workspace_id") || ""

    return (
        <>
            <div onClick={() => setIsModalOpen(true)}>
                {children}
            </div>

            <CreatePostModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                workspaceId={activeWorkspaceId}
            />
        </>
    )
}
