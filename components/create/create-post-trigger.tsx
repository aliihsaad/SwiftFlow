"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { PlusCircle } from "lucide-react"

export function CreatePostTrigger({ workspaceId }: { workspaceId: string }) {
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Auto-open for testing convenience or user expectation
    useEffect(() => {
        setIsModalOpen(true)
    }, [])

    return (
        <>
            <Button size="lg" onClick={() => setIsModalOpen(true)} className="gap-2">
                <PlusCircle className="h-5 w-5" />
                Open Creator
            </Button>

            <CreatePostModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                workspaceId={workspaceId}
            />
        </>
    )
}
