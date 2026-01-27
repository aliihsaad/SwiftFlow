"use client"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"

interface MessagesHeaderProps {
    onSync: () => void
    isSyncing: boolean
    totalConversations: number
    unreadCount: number
}

export function MessagesHeader({ onSync, isSyncing, totalConversations, unreadCount }: MessagesHeaderProps) {
    return (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                        <Inbox className="h-5 w-5 text-pink-500" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
                            <p className="text-sm text-muted-foreground">
                                {totalConversations > 0 ? `${totalConversations} conversations` : 'Manage your Instagram DMs'}
                            </p>
                        </div>
                        {unreadCount > 0 && (
                            <Badge className="bg-pink-500 hover:bg-pink-600">
                                {unreadCount} unread
                            </Badge>
                        )}
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
                    {isSyncing ? "Syncing..." : "Sync Messages"}
                </Button>
            </div>
        </div>
    )
}
