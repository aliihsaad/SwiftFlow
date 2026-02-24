"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Wand2, Camera, Palette, Smile, Sparkles, BarChart3, Mountain, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface CarouselStyleSelectorProps {
    topic: string
    onGenerate: (slideCount: number, style: string) => void
    isGenerating?: boolean
}

const SLIDE_COUNTS = [2, 3, 4]

const STYLES = [
    { id: 'fun-cartoon', label: 'Fun Cartoon', icon: Smile, color: 'text-rose-300', bg: 'bg-rose-400/10 border border-rose-300/15' },
    { id: 'realistic', label: 'Realistic', icon: Camera, color: 'text-cyan-300', bg: 'bg-cyan-400/10 border border-cyan-300/15' },
    { id: 'minimal', label: 'Minimal', icon: Sparkles, color: 'text-amber-300', bg: 'bg-amber-400/10 border border-amber-300/15' },
    { id: 'artistic', label: 'Artistic', icon: Palette, color: 'text-lime-300', bg: 'bg-lime-400/10 border border-lime-300/15' },
    { id: 'infographic', label: 'Infographic', icon: BarChart3, color: 'text-emerald-300', bg: 'bg-emerald-400/10 border border-emerald-300/15' },
    { id: '3d-render', label: '3D Render', icon: Mountain, color: 'text-orange-300', bg: 'bg-orange-400/10 border border-orange-300/15' },
]

export function CarouselStyleSelector({ topic, onGenerate, isGenerating = false }: CarouselStyleSelectorProps) {
    const [selectedCount, setSelectedCount] = useState(2)
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null)

    const handleGenerate = () => {
        if (selectedStyle) {
            onGenerate(selectedCount, selectedStyle)
        }
    }

    return (
        <div className="w-full max-w-lg animate-in fade-in slide-in-from-bottom-2 space-y-5 rounded-xl border border-white/10 bg-[#1b1d28] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]">
            <div className="space-y-1">
                <p className="text-sm text-white/50">Creating Instagram carousel about</p>
                <h3 className="font-semibold text-cyan-100">"{topic}"</h3>
            </div>

            {/* Slide Count */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-white/60">How many slides?</p>
                <div className="flex gap-2">
                    {SLIDE_COUNTS.map((count) => (
                        <button
                            key={count}
                            onClick={() => setSelectedCount(count)}
                            disabled={isGenerating}
                            className={cn(
                                "px-4 py-2 rounded-lg border text-sm font-medium transition-all",
                                "hover:scale-[1.02] active:scale-[0.98]",
                                selectedCount === count
                                    ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100 shadow-sm"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:bg-white/5"
                            )}
                        >
                            {count} slides
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Selection */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-white/60">Choose a style</p>
                <div className="grid grid-cols-3 gap-2">
                    {STYLES.map((style) => {
                        const Icon = style.icon
                        return (
                            <button
                                key={style.id}
                                onClick={() => setSelectedStyle(style.id)}
                                disabled={isGenerating}
                                className={cn(
                                    "flex items-center gap-2 p-3 rounded-lg border transition-all text-left",
                                    "hover:scale-[1.02] active:scale-[0.98]",
                                    selectedStyle === style.id
                                        ? "ring-2 ring-cyan-300/30 border-cyan-300/25"
                                        : "hover:bg-white/5",
                                    style.bg
                                )}
                            >
                                <Icon className={cn("w-4 h-4", style.color)} />
                                <span className="text-xs font-medium text-white/85">{style.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={!selectedStyle || isGenerating}
                className="w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                size="lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating {selectedCount} slides...
                    </>
                ) : (
                    <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        Generate {selectedCount} Carousel
                    </>
                )}
            </Button>

            {isGenerating && (
                <p className="text-xs text-center text-white/45">
                    This may take 1-2 minutes for 2+ images
                </p>
            )}
        </div>
    )
}
