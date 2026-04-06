"use client"

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
            <div className="flex items-center gap-3">
                <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}
                >
                    <MessageCircle className="h-5 w-5" style={{ color: '#a78bfa' }} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'rgba(255,255,255,0.9)' }}>
                        Comments
                    </h1>
                    <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {totalComments > 0 ? `${totalComments} comments` : 'Manage comments from your posts'}
                    </p>
                </div>
            </div>

            <button
                onClick={onSync}
                disabled={isSyncing}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold self-start transition-all duration-150 disabled:opacity-50"
                style={{
                    background: '#12111e',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.5)',
                }}
            >
                <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
                {isSyncing ? "Syncing…" : "Sync Comments"}
            </button>
        </div>
    )
}
