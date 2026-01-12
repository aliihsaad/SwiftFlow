"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Wand2, Camera, Palette, Smile, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

interface StyleSelectorProps {
    onSelect: (style: string, enhance: boolean) => void
    isGenerating?: boolean
}

const STYLES = [
    { id: 'realistic', label: 'Realistic', icon: Camera, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { id: 'cartoon', label: 'Fun Cartoon', icon: Smile, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { id: 'minimal', label: 'Minimal', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { id: 'artistic', label: 'Artistic', icon: Palette, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
]

export function StyleSelector({ onSelect, isGenerating = false }: StyleSelectorProps) {
    const [enhanceEnabled, setEnhanceEnabled] = useState(false)

    return (
        <div className="w-full max-w-md bg-card border rounded-xl p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Choose a style for your image:</h3>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEnhanceEnabled(!enhanceEnabled)}
                    className={cn(
                        "transition-all gap-1.5 h-8 text-xs",
                        enhanceEnabled
                            ? "border-violet-500 bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Enhance prompt with AI"
                >
                    <Wand2 className={cn("w-3.5 h-3.5", enhanceEnabled ? "animate-pulse" : "")} />
                    {enhanceEnabled ? "Magic Wand ON" : "Magic Wand"}
                </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {STYLES.map((style) => {
                    const Icon = style.icon
                    return (
                        <button
                            key={style.id}
                            onClick={() => onSelect(style.label, enhanceEnabled)}
                            disabled={isGenerating}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                                "hover:scale-[1.02] active:scale-[0.98]",
                                "hover:bg-accent hover:border-accent-foreground/20",
                                style.bg
                            )}
                        >
                            <div className={cn("p-2 rounded-full bg-white dark:bg-black/20 shadow-sm", style.color)}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium">{style.label}</span>
                        </button>
                    )
                })}
            </div>

            {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse">
                    <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                    <span>Adding magic and generating...</span>
                </div>
            )}
        </div>
    )
}
