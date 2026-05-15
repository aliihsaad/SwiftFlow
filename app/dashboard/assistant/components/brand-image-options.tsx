"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
    Sparkles, Palette, Camera, Gem, Zap, Brush,
    Eye, Droplets, LayoutTemplate, Lightbulb,
    RefreshCw, SwatchBook, Minimize2, Shapes,
    Wand2, Loader2
} from "lucide-react"
import { cn } from "@/lib/utils"

// ── Mode Selector ──────────────────────────────────────────────

interface BrandImageModeSelectorProps {
    onSelect: (mode: 'generate' | 'transform') => void
}

export function BrandImageModeSelector({ onSelect }: BrandImageModeSelectorProps) {
    return (
        <div className="flex w-full flex-col gap-3 sm:flex-row">
            <Button
                variant="outline"
                className="h-auto min-h-24 flex-1 flex-col gap-2 py-4"
                onClick={() => onSelect('generate')}
            >
                <Sparkles className="w-5 h-5" />
                <div className="text-center">
                    <div className="font-semibold">Generate New</div>
                    <div className="text-xs opacity-80">Create images matching your brand</div>
                </div>
            </Button>

            <Button
                variant="outline"
                className="h-auto min-h-24 flex-1 flex-col gap-2 py-4"
                onClick={() => onSelect('transform')}
            >
                <RefreshCw className="w-5 h-5" />
                <div className="text-center">
                    <div className="font-semibold">Transform Existing</div>
                    <div className="text-xs opacity-80">Restyle or recolor uploaded images</div>
                </div>
            </Button>
        </div>
    )
}

// ── Options Panel ──────────────────────────────────────────────

const IMAGE_COUNTS = [1, 2, 3, 4]

const STYLE_PRESETS = [
    { id: 'realistic', label: 'Realistic', icon: Camera, color: 'text-cyan-300', bg: 'bg-cyan-400/10 border border-cyan-300/15' },
    { id: 'minimal', label: 'Minimal', icon: Minimize2, color: 'text-amber-300', bg: 'bg-amber-400/10 border border-amber-300/15' },
    { id: 'vibrant', label: 'Vibrant', icon: Zap, color: 'text-rose-300', bg: 'bg-rose-400/10 border border-rose-300/15' },
    { id: 'elegant', label: 'Elegant', icon: Gem, color: 'text-violet-300', bg: 'bg-violet-400/10 border border-violet-300/15' },
    { id: 'bold', label: 'Bold', icon: Shapes, color: 'text-orange-300', bg: 'bg-orange-400/10 border border-orange-300/15' },
    { id: 'artistic', label: 'Artistic', icon: Brush, color: 'text-lime-300', bg: 'bg-lime-400/10 border border-lime-300/15' },
]

const REFERENCE_MODES = [
    { id: 'match-style', label: 'Match Style', icon: Eye },
    { id: 'match-colors', label: 'Match Colors', icon: Droplets },
    { id: 'use-as-template', label: 'Use as Template', icon: LayoutTemplate },
    { id: 'inspired-by', label: 'Inspired By', icon: Lightbulb },
]

const TRANSFORM_ACTIONS = [
    { id: 'restyle', label: 'Restyle', icon: Palette },
    { id: 'add-brand-colors', label: 'Add Brand Colors', icon: SwatchBook },
    { id: 'modernize', label: 'Modernize', icon: Sparkles },
    { id: 'simplify', label: 'Simplify', icon: Minimize2 },
]

interface BrandImageOptionsProps {
    mode: 'generate' | 'transform'
    prompt: string
    hasReferenceImages: boolean
    referenceCount: number
    onGenerate: (options: {
        imageCount: number
        style: string
        referenceMode: string | null
        transformAction: string | null
        enhance: boolean
    }) => void
    isGenerating?: boolean
}

export function BrandImageOptions({
    mode,
    prompt,
    hasReferenceImages,
    referenceCount,
    onGenerate,
    isGenerating = false
}: BrandImageOptionsProps) {
    const [imageCount, setImageCount] = useState(1)
    const [selectedStyle, setSelectedStyle] = useState<string | null>(null)
    const [referenceMode, setReferenceMode] = useState<string | null>(hasReferenceImages ? 'match-style' : null)
    const [transformAction, setTransformAction] = useState<string | null>(mode === 'transform' ? 'restyle' : null)
    const [enhanceEnabled, setEnhanceEnabled] = useState(false)

    const handleGenerate = () => {
        if (!selectedStyle) return
        onGenerate({
            imageCount,
            style: selectedStyle,
            referenceMode: hasReferenceImages ? referenceMode : null,
            transformAction: mode === 'transform' ? transformAction : null,
            enhance: enhanceEnabled,
        })
    }

    return (
        <div className="w-full max-w-none animate-in fade-in slide-in-from-bottom-2 space-y-5 rounded-xl border border-white/10 bg-[#1b1d28] p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)] sm:max-w-lg sm:p-5">
            <div className="space-y-1">
                <p className="text-sm text-white/50">
                    {mode === 'generate' ? 'Generating brand images' : 'Transforming images'} for
                </p>
                <h3 className="break-words font-semibold text-cyan-100">&quot;{prompt}&quot;</h3>
                {hasReferenceImages && (
                    <p className="text-xs text-white/40">{referenceCount} reference image{referenceCount > 1 ? 's' : ''} attached</p>
                )}
            </div>

            {/* Image Count */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-white/60">How many images?</p>
                <div className="flex gap-2">
                    {IMAGE_COUNTS.map((count) => (
                        <button
                            key={count}
                            onClick={() => setImageCount(count)}
                            disabled={isGenerating}
                            className={cn(
                                "min-h-10 flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all",
                                "active:scale-[0.98] sm:hover:scale-[1.02]",
                                imageCount === count
                                    ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100 shadow-sm"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:bg-white/5"
                            )}
                        >
                            {count}
                        </button>
                    ))}
                </div>
            </div>

            {/* Style Preset */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-white/60">Style preset</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {STYLE_PRESETS.map((style) => {
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
                                <Icon className={cn("h-4 w-4 shrink-0", style.color)} />
                                <span className="min-w-0 text-xs font-medium text-white/85">{style.label}</span>
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Reference Mode (only if images attached) */}
            {hasReferenceImages && mode === 'generate' && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-white/60">Reference mode</p>
                    <div className="grid grid-cols-2 gap-2">
                        {REFERENCE_MODES.map((rm) => {
                            const Icon = rm.icon
                            return (
                                <button
                                    key={rm.id}
                                    onClick={() => setReferenceMode(rm.id)}
                                    disabled={isGenerating}
                                    className={cn(
                                        "flex min-h-12 items-center gap-2 rounded-lg border p-2.5 text-left transition-all",
                                        "active:scale-[0.99] sm:hover:scale-[1.01]",
                                        referenceMode === rm.id
                                            ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                                            : "border-white/10 bg-[#151620] text-white/70 hover:bg-white/5"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-xs font-medium">{rm.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Transform Action (only in transform mode) */}
            {mode === 'transform' && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-white/60">Transform action</p>
                    <div className="grid grid-cols-2 gap-2">
                        {TRANSFORM_ACTIONS.map((ta) => {
                            const Icon = ta.icon
                            return (
                                <button
                                    key={ta.id}
                                    onClick={() => setTransformAction(ta.id)}
                                    disabled={isGenerating}
                                    className={cn(
                                        "flex min-h-12 items-center gap-2 rounded-lg border p-2.5 text-left transition-all",
                                        "active:scale-[0.99] sm:hover:scale-[1.01]",
                                        transformAction === ta.id
                                            ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
                                            : "border-white/10 bg-[#151620] text-white/70 hover:bg-white/5"
                                    )}
                                >
                                    <Icon className="w-3.5 h-3.5 shrink-0" />
                                    <span className="text-xs font-medium">{ta.label}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* Magic Wand + Generate */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEnhanceEnabled(!enhanceEnabled)}
                    disabled={isGenerating}
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

                <Button
                    onClick={handleGenerate}
                    disabled={!selectedStyle || isGenerating}
                    className="min-h-11 flex-1 border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                    size="lg"
                >
                    {isGenerating ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating{imageCount > 1 ? ` ${imageCount} images` : ''}...
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate {imageCount > 1 ? `${imageCount} Images` : 'Image'}
                        </>
                    )}
                </Button>
            </div>

            {isGenerating && imageCount > 1 && (
                <p className="text-xs text-center text-white/45">
                    Generating {imageCount} images may take 1-2 minutes
                </p>
            )}
        </div>
    )
}
