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
    { id: 'fun-cartoon', label: 'Fun Cartoon', icon: Smile, color: 'text-pink-500', bg: 'bg-pink-50 dark:bg-pink-900/20' },
    { id: 'realistic', label: 'Realistic', icon: Camera, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-900/20' },
    { id: 'minimal', label: 'Minimal', icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
    { id: 'artistic', label: 'Artistic', icon: Palette, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-900/20' },
    { id: 'infographic', label: 'Infographic', icon: BarChart3, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-900/20' },
    { id: '3d-render', label: '3D Render', icon: Mountain, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20' },
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
        <div className="w-full max-w-lg bg-card border rounded-xl p-5 space-y-5 shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Creating Instagram carousel about</p>
                <h3 className="font-semibold text-primary">"{topic}"</h3>
            </div>

            {/* Slide Count */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">How many slides?</p>
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
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-background hover:bg-accent"
                            )}
                        >
                            {count} slides
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Selection */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Choose a style</p>
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
                                        ? "ring-2 ring-primary border-primary"
                                        : "hover:bg-accent",
                                    style.bg
                                )}
                            >
                                <Icon className={cn("w-4 h-4", style.color)} />
                                <span className="text-xs font-medium">{style.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Generate Button */}
            <Button
                onClick={handleGenerate}
                disabled={!selectedStyle || isGenerating}
                className="w-full"
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
                <p className="text-xs text-center text-muted-foreground">
                    This may take 1-2 minutes for 2+ images
                </p>
            )}
        </div>
    )
}
