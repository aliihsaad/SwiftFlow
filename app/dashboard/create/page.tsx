"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { CreatePostModal } from "@/components/create/create-post-modal"
import { PlusCircle } from "lucide-react"

export default function CreatePostPage() {
    const [isModalOpen, setIsModalOpen] = useState(false)

    // Auto-open for testing convenience or user expectation
    useEffect(() => {
        setIsModalOpen(true)
    }, [])

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col items-center justify-center space-y-4">
            <div className="text-center space-y-2">
                <h1 className="text-2xl font-bold">Create New Post</h1>
                <p className="text-muted-foreground">Start creating content for your platforms.</p>
            </div>

            <Button size="lg" onClick={() => setIsModalOpen(true)} className="gap-2">
                <PlusCircle className="h-5 w-5" />
                Open Creator
            </Button>

            <CreatePostModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
            />
        </div>
    )
}
