"use client"

/* eslint-disable @next/next/no-img-element */

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Copy, Check, ImageIcon, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import {
    CAROUSEL_SLIDE_CARD_CLASS,
    CAROUSEL_SLIDE_FRAME_CLASS,
    CAROUSEL_SLIDE_TRACK_CLASS,
} from "@/lib/assistant/carousel-preview-layout"

interface Slide {
    slide_number: number
    title: string
    content: string
    image_prompt?: string
    caption?: string
    imageUrl?: string
    isGenerating?: boolean
}

interface CarouselPreviewProps {
    slots: Slide[]
    caption?: string
    onGenerateImage?: (slideNumber: number, prompt: string) => void
    onSchedule?: (slideId: string, content: string, images?: string[]) => void
    generatingSlide?: number | null
    slideImageErrors?: Record<number, string>
}

export function CarouselPreview({ slots, caption, onGenerateImage, onSchedule, generatingSlide, slideImageErrors = {} }: CarouselPreviewProps) {
    const [copiedCaption, setCopiedCaption] = useState(false)

    const copyCaption = async () => {
        if (!caption) return
        await navigator.clipboard.writeText(caption)
        setCopiedCaption(true)
        toast.success("Caption copied!")
        setTimeout(() => setCopiedCaption(false), 2000)
    }

    const handleScheduleAll = () => {
        if (!onSchedule) return
        // Collect all available images
        const images = slots.map(s => s.imageUrl).filter(Boolean) as string[]
        const mainContent = caption || slots[0].content // Fallback to first slide content if no caption
        onSchedule("carousel_post", mainContent, images)
    }

    return (
        <div className="flex min-w-0 flex-col gap-4">
            <div className={CAROUSEL_SLIDE_FRAME_CLASS}>
                <div
                    aria-label="Carousel slides"
                    className={CAROUSEL_SLIDE_TRACK_CLASS}
                    tabIndex={0}
                >
                    {slots.map((slide) => {
                        const isGenerating = generatingSlide === slide.slide_number
                        const slideError = slideImageErrors[slide.slide_number]

                        return (
                            <Card key={slide.slide_number} className={CAROUSEL_SLIDE_CARD_CLASS}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Badge variant="outline" className="border-white/10 bg-white/5 text-white/70">Slide {slide.slide_number}</Badge>
                                    <div className="ml-auto flex flex-wrap items-center gap-2">
                                        {slide.slide_number === 1 && <Badge className="border-cyan-300/20 bg-cyan-400/10 text-cyan-200">Hook</Badge>}
                                        {slide.slide_number === slots.length && <Badge className="border-amber-300/20 bg-amber-400/10 text-amber-200">CTA</Badge>}
                                    </div>
                                </div>

                                <div className="min-w-0 space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Title</p>
                                    <h4 className="whitespace-normal break-words text-sm font-bold leading-snug text-white/90">{slide.title}</h4>
                                </div>

                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Content</p>
                                    <p className="max-h-[60px] overflow-y-auto whitespace-normal break-words text-xs leading-relaxed text-white/50">
                                        {slide.content}
                                    </p>
                                </div>



                                {slide.image_prompt && (
                                    <div className="space-y-2 border-t border-white/10 pt-2">
                                        <div className="whitespace-normal break-words rounded border border-dashed border-white/15 bg-white/5 p-2 text-[10px] text-white/45">
                                            🖼️ {slide.image_prompt.slice(0, 50)}...
                                        </div>
                                        <div className="flex gap-2">
                                            {onGenerateImage && !slide.imageUrl && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-10 w-full border-white/10 bg-white/5 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:h-8"
                                                    onClick={() => onGenerateImage(slide.slide_number, slide.image_prompt!)}
                                                    disabled={isGenerating || generatingSlide !== null}
                                                >
                                                    {isGenerating ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ImageIcon className="w-3 h-3 mr-1.5" />
                                                            Image
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                        {slide.imageUrl && (
                                            <img
                                                src={slide.imageUrl}
                                                alt={`Slide ${slide.slide_number}`}
                                                className="h-32 w-full rounded-md object-cover"
                                            />
                                        )}
                                        {slideError && (
                                            <div className="whitespace-normal break-words rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
                                                {slideError}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
            </div>
            {/* Carousel Footer Actions */}
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                {caption && (
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-white/85">Target Caption</h4>
                            <button
                                type="button"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-white/50 hover:bg-white/5 hover:text-white/80 sm:h-7 sm:w-7"
                                onClick={copyCaption}
                                title="Copy caption"
                            >
                                {copiedCaption ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </button>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/50">{caption}</p>
                    </div>
                )}

                {onSchedule && (
                    <Button
                        onClick={handleScheduleAll}
                        className="min-h-11 w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                    >
                        Schedule Carousel Post
                    </Button>
                )}
            </div>
        </div >
    )
}
