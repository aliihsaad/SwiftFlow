"use client"

import { Button } from "@/components/ui/button"
import { Facebook, Instagram, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface PlatformSelectorProps {
    selectedPlatforms: string[]
    onToggle: (platform: string) => void
}

export function PlatformSelector({ selectedPlatforms, onToggle }: PlatformSelectorProps) {
    const isSelected = (p: string) => selectedPlatforms.includes(p)

    return (
        <div className="flex gap-4">
            <Button
                variant="outline"
                className={cn(
                    "h-24 w-32 flex-col gap-2 border-2 transition-all hover:bg-pink-50 hover:border-pink-200 dark:hover:bg-pink-950/20",
                    isSelected("instagram") && "border-pink-500 bg-pink-50 text-pink-700 dark:bg-pink-950/10 dark:text-pink-400"
                )}
                onClick={() => onToggle("instagram")}
            >
                <div className="relative">
                    <Instagram className={cn("h-8 w-8", isSelected("instagram") ? "text-pink-600" : "text-muted-foreground")} />
                    {isSelected("instagram") && <div className="absolute -top-1 -right-1 bg-pink-600 rounded-full p-0.5"><Check className="h-2 w-2 text-white" /></div>}
                </div>
                Instagram
            </Button>

            <Button
                variant="outline"
                className={cn(
                    "h-24 w-32 flex-col gap-2 border-2 transition-all hover:bg-blue-50 hover:border-blue-200 dark:hover:bg-blue-950/20",
                    isSelected("facebook") && "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/10 dark:text-blue-400"
                )}
                onClick={() => onToggle("facebook")}
            >
                <div className="relative">
                    <Facebook className={cn("h-8 w-8", isSelected("facebook") ? "text-blue-600" : "text-muted-foreground")} />
                    {isSelected("facebook") && <div className="absolute -top-1 -right-1 bg-blue-600 rounded-full p-0.5"><Check className="h-2 w-2 text-white" /></div>}
                </div>
                Facebook
            </Button>
        </div>
    )
}
