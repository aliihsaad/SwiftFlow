"use client"

import { Button } from "@/components/ui/button"
import { RefreshCw, MessageCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface CommentsHeaderProps {
    onSync: () => void
    isSyncing: boolean
    totalComments: number
}

export function CommentsHeader({ onSync, isSyncing, totalComments }: CommentsHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10">
                        <MessageCircle className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight">Comments</h1>
                        <p className="text-sm text-muted-foreground">
                            {totalComments > 0 ? `${totalComments} comments` : 'Manage comments from your posts'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={onSync}
                    disabled={isSyncing}
                    className="gap-2"
                >
                    <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                    {isSyncing ? "Syncing..." : "Sync Comments"}
                </Button>
            </div>
        </div>
    )
}
