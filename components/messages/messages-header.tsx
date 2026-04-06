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
                    <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{
                            background: 'rgba(56,189,248,0.10)',
                            border: '1px solid rgba(56,189,248,0.18)',
                        }}
                    >
                        <Inbox className="h-5 w-5" style={{ color: '#38bdf8' }} />
                    </div>
                    <div className="flex items-center gap-2">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>Messages</h1>
                            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
                                {totalConversations > 0 ? `${totalConversations} conversations` : 'Manage your Instagram DMs'}
                            </p>
                        </div>
                        {unreadCount > 0 && (
                            <Badge className="border-0" style={{ background: '#fb7185', color: '#fff' }}>
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
                    style={{
                        background: '#1b1d28',
                        borderColor: 'rgba(255,255,255,0.08)',
                        color: 'rgba(255,255,255,0.75)',
                    }}
                >
                    <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                    {isSyncing ? "Syncing..." : "Sync Messages"}
                </Button>
            </div>
        </div>
    )
}
