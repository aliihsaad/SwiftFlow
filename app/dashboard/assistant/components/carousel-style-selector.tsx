"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Wand2, Camera, Palette, Smile, Sparkles, BarChart3, Mountain, Loader2, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface CarouselStyleSelectorProps {
    topic: string
    onGenerate: (slideCount: number, style: string, research?: boolean) => void
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
    const [research, setResearch] = useState(false)

    const handleGenerate = () => {
        if (selectedStyle) {
            onGenerate(selectedCount, selectedStyle, research)
        }
    }

    return (
        <div className="w-full max-w-none animate-in fade-in slide-in-from-bottom-2 space-y-5 rounded-xl border border-white/10 bg-[#1b1d28] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)] sm:max-w-lg sm:p-5">
            <div className="space-y-1">
                <p className="text-sm text-white/50">Creating Instagram carousel about</p>
                <h3 className="break-words font-semibold text-cyan-100">&quot;{topic}&quot;</h3>
            </div>

            {/* Slide Count */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-white/60">How many slides?</p>
                <div className="grid grid-cols-3 gap-2">
                    {SLIDE_COUNTS.map((count) => (
                        <button
                            key={count}
                            onClick={() => setSelectedCount(count)}
                            disabled={isGenerating}
                            className={cn(
                                "min-h-10 min-w-0 rounded-lg border px-2 py-2 text-sm font-medium transition-all",
                                "active:scale-[0.98] sm:hover:scale-[1.02]",
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STYLES.map((style) => {
                        const Icon = style.icon
                        return (
                            <button
                                key={style.id}
                                onClick={() => setSelectedStyle(style.id)}
                                disabled={isGenerating}
                                className={cn(
                                    "flex min-h-12 items-center gap-2 rounded-lg border p-3 text-left transition-all",
                                    "active:scale-[0.98] sm:hover:scale-[1.02]",
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

            {/* Research First Toggle */}
            <button
                onClick={() => setResearch(!research)}
                disabled={isGenerating}
                className={cn(
                    "flex min-h-16 w-full items-center gap-3 rounded-lg border-2 p-3 transition-all",
                    research
                        ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                        : "border-white/10 bg-[#151620] text-white/70 hover:border-amber-300/15 hover:bg-white/5"
                )}
            >
                <div className={cn(
                    "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                    research ? "bg-amber-400/20" : "bg-white/5"
                )}>
                    <Search className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1 text-left">
                    <span className="text-sm font-medium block">Research First 🔍</span>
                    <span className={cn(
                        "block break-words text-xs transition-colors",
                        research ? "text-amber-200/70" : "text-white/40"
                    )}>
                        Research real facts & trends for slide content
                    </span>
                </div>
                <div className={cn(
                    "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                    research ? "bg-amber-400/40" : "bg-white/10"
                )}>
                    <div className={cn(
                        "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                        research ? "left-[18px] bg-amber-300" : "left-0.5 bg-white/40"
                    )} />
                </div>
            </button>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={!selectedStyle || isGenerating}
                className="w-full border border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                size="lg"
            >
                {isGenerating ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {research ? 'Researching & Generating...' : `Generating ${selectedCount} slides...`}
                    </>
                ) : (
                    <>
                        {research ? <Search className="w-4 h-4 mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                        {research ? `Research & Generate ${selectedCount} Carousel` : `Generate ${selectedCount} Carousel`}
                    </>
                )}
            </Button>

            {isGenerating && (
                <p className="text-xs text-center text-white/45">
                    {research ? 'Researching trends then generating slides — this may take 2-3 minutes' : 'This may take 1-2 minutes for 2+ images'}
                </p>
            )}
        </div>
    )
}
