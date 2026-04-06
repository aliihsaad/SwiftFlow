"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Copy, Check, ImageIcon, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

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
}

export function CarouselPreview({ slots, caption, onGenerateImage, onSchedule, generatingSlide }: CarouselPreviewProps) {
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
        <div className="flex flex-col gap-4">
            <ScrollArea className="w-full whitespace-nowrap rounded-xl border border-white/10 bg-[#151620]">
                <div className="flex w-max space-x-4 p-4">
                    {slots.map((slide, idx) => {
                        const isGenerating = generatingSlide === slide.slide_number

                        return (
                            <Card key={slide.slide_number} className="flex h-auto min-h-[320px] w-[280px] shrink-0 flex-col gap-3 border-white/10 bg-[#1b1d28] p-4 text-white/85">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Badge variant="outline" className="border-white/10 bg-white/5 text-white/70">Slide {slide.slide_number}</Badge>
                                    <div className="ml-auto flex flex-wrap items-center gap-2">
                                        {slide.slide_number === 1 && <Badge className="border-cyan-300/20 bg-cyan-400/10 text-cyan-200">Hook</Badge>}
                                        {slide.slide_number === slots.length && <Badge className="border-amber-300/20 bg-amber-400/10 text-amber-200">CTA</Badge>}
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Title</p>
                                    <h4 className="text-sm font-bold leading-snug text-white/90 whitespace-normal">{slide.title}</h4>
                                </div>

                                <div className="space-y-1 flex-1">
                                    <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Content</p>
                                    <p className="max-h-[60px] overflow-y-auto whitespace-normal text-xs leading-relaxed text-white/50">
                                        {slide.content}
                                    </p>
                                </div>



                                {slide.image_prompt && (
                                    <div className="space-y-2 border-t border-white/10 pt-2">
                                        <div className="rounded border border-dashed border-white/15 bg-white/5 p-2 text-[10px] text-white/45 whitespace-normal">
                                            🖼️ {slide.image_prompt.slice(0, 50)}...
                                        </div>
                                        <div className="flex gap-2">
                                            {onGenerateImage && !slide.imageUrl && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 w-full border-white/10 bg-white/5 text-xs text-white/75 hover:bg-white/10 hover:text-white"
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
                                                className="w-full h-32 object-cover rounded-md"
                                            />
                                        )}
                                    </div>
                                )}
                            </Card>
                        )
                    })}
                </div>
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {/* Carousel Footer Actions */}
            <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#1b1d28] p-4">
                {caption && (
                    <div className="space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-white/85">Target Caption</h4>
                            <button
                                type="button"
                                className="shrink-0 rounded p-1 text-white/50 hover:bg-white/5 hover:text-white/80"
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
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/50">{caption}</p>
                    </div>
                )}

                {onSchedule && (
                    <Button
                        onClick={handleScheduleAll}
                        className="w-full border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                    >
                        Schedule Carousel Post
                    </Button>
                )}
            </div>
        </div >
    )
}
