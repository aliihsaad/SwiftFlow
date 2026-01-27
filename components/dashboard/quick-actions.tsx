"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Sparkles, Plus, BarChart, Bot } from "lucide-react"
import Link from "next/link"
import { CreatePostModal } from "@/components/create/create-post-modal"

interface QuickActionsProps {
    workspaceId?: string
}

export function QuickActions({ workspaceId }: QuickActionsProps) {
    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false)

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link href="/dashboard/assistant">
                    <Button
                        variant="outline"
                        className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-linear-to-br hover:from-purple-50 hover:to-indigo-50 dark:hover:from-purple-950/30 dark:hover:to-indigo-950/30 border-dashed hover:border-solid transition-all duration-300"
                    >
                        <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <span className="font-medium">Generate Ideas</span>
                    </Button>
                </Link>

                <Button
                    variant="outline"
                    className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-linear-to-br hover:from-pink-50 hover:to-rose-50 dark:hover:from-pink-950/30 dark:hover:to-rose-950/30 border-dashed hover:border-solid transition-all duration-300"
                    onClick={() => setIsCreatePostModalOpen(true)}
                >
                    <div className="p-2 rounded-full bg-pink-100 dark:bg-pink-900/50 text-pink-600 dark:text-pink-400">
                        <Plus className="h-5 w-5" />
                    </div>
                    <span className="font-medium">Create Post</span>
                </Button>

                <Link href="/dashboard/analytics">
                    <Button
                        variant="outline"
                        className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-linear-to-br hover:from-blue-50 hover:to-cyan-50 dark:hover:from-blue-950/30 dark:hover:to-cyan-950/30 border-dashed hover:border-solid transition-all duration-300"
                    >
                        <div className="p-2 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400">
                            <BarChart className="h-5 w-5" />
                        </div>
                        <span className="font-medium">View Analytics</span>
                    </Button>
                </Link>

                <Link href="/dashboard/assistant">
                    <Button
                        variant="outline"
                        className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-linear-to-br hover:from-emerald-50 hover:to-teal-50 dark:hover:from-emerald-950/30 dark:hover:to-teal-950/30 border-dashed hover:border-solid transition-all duration-300"
                    >
                        <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                            <Bot className="h-5 w-5" />
                        </div>
                        <span className="font-medium">AI Assistant</span>
                    </Button>
                </Link>
            </div>

            <CreatePostModal
                open={isCreatePostModalOpen}
                onOpenChange={setIsCreatePostModalOpen}
                workspaceId={workspaceId || ""}
            />
        </>
    )
}
