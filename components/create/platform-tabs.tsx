"use client"

import { Platform } from "@/types/post"
import { Monitor, Instagram, Facebook } from "lucide-react" // Monitor as 'All' icon placeholder
import { cn } from "@/lib/utils"

interface PlatformTabsProps {
    activeTab: Platform | 'all'
    onTabChange: (tab: Platform | 'all') => void
    platforms: {
        instagram: boolean
        facebook: boolean
    }
}

export function PlatformTabs({ activeTab, onTabChange, platforms }: PlatformTabsProps) {
    return (
        <div className="flex bg-muted/40 p-1 rounded-full w-fit border border-border/40">
            <button
                onClick={() => onTabChange('all')}
                className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200",
                    activeTab === 'all'
                        ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                )}
            >
                <Monitor className="h-4 w-4" />
                All
            </button>

            <button
                onClick={() => onTabChange('instagram')}
                disabled={!platforms.instagram}
                className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200",
                    activeTab === 'instagram'
                        ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                    !platforms.instagram && "opacity-50 cursor-not-allowed"
                )}
            >
                <Instagram className="h-4 w-4 text-pink-500" />
                Instagram
            </button>

            <button
                onClick={() => onTabChange('facebook')}
                disabled={!platforms.facebook}
                className={cn(
                    "flex items-center gap-2 px-6 py-2 rounded-full text-sm font-medium transition-all duration-200",
                    activeTab === 'facebook'
                        ? "bg-background text-foreground shadow-sm ring-1 ring-black/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-background/50",
                    !platforms.facebook && "opacity-50 cursor-not-allowed"
                )}
            >
                <Facebook className="h-4 w-4 text-blue-600" />
                Facebook
            </button>
        </div>
    )
}
