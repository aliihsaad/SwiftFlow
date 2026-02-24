"use client"

import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface InlineLoadingHintProps {
    label: string
    className?: string
}

export function InlineLoadingHint({ label, className }: InlineLoadingHintProps) {
    return (
        <div
            className={cn("inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium", className)}
            style={{
                background: '#0e0d1c',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.45)',
            }}
        >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {label}
        </div>
    )
}

