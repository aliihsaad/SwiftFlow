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
    { id: 'realistic', label: 'Realistic', icon: Camera, color: 'text-cyan-300', bg: 'bg-cyan-400/10 border border-cyan-300/15' },
    { id: 'cartoon', label: 'Fun Cartoon', icon: Smile, color: 'text-rose-300', bg: 'bg-rose-400/10 border border-rose-300/15' },
    { id: 'minimal', label: 'Minimal', icon: Sparkles, color: 'text-amber-300', bg: 'bg-amber-400/10 border border-amber-300/15' },
    { id: 'artistic', label: 'Artistic', icon: Palette, color: 'text-lime-300', bg: 'bg-lime-400/10 border border-lime-300/15' },
]

export function StyleSelector({ onSelect, isGenerating = false }: StyleSelectorProps) {
    const [enhanceEnabled, setEnhanceEnabled] = useState(false)

    return (
        <div className="w-full max-w-none animate-in fade-in slide-in-from-bottom-2 space-y-4 rounded-xl border border-white/10 bg-[#1b1d28] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)] sm:max-w-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-sm font-medium text-white/55">Choose a style for your image:</h3>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEnhanceEnabled(!enhanceEnabled)}
                    className={cn(
                        "h-10 gap-1.5 text-xs transition-all sm:h-8",
                        enhanceEnabled
                            ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-200 shadow-[0_0_10px_rgba(56,189,248,0.18)]"
                            : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10 hover:text-white/80"
                    )}
                    title="Enhance prompt with AI"
                >
                    <Wand2 className={cn("w-3.5 h-3.5", enhanceEnabled ? "animate-pulse" : "")} />
                    {enhanceEnabled ? "Magic Wand ON" : "Magic Wand"}
                </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
                {STYLES.map((style) => {
                    const Icon = style.icon
                    return (
                        <button
                            key={style.id}
                            onClick={() => onSelect(style.label, enhanceEnabled)}
                            disabled={isGenerating}
                            className={cn(
                                "flex min-h-12 items-center gap-3 rounded-lg border p-3 text-left transition-all",
                                "active:scale-[0.98] sm:hover:scale-[1.02]",
                                "hover:bg-white/5 hover:border-white/20",
                                style.bg
                            )}
                        >
                            <div className={cn("rounded-full bg-black/20 p-2 shadow-sm", style.color)}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-white/85">{style.label}</span>
                        </button>
                    )
                })}
            </div>

            {isGenerating && (
                <div className="flex items-center gap-2 text-xs text-white/50 animate-pulse">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Adding magic and generating...</span>
                </div>
            )}
        </div>
    )
}
