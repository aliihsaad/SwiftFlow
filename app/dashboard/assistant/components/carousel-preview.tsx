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
            <ScrollArea className="w-full whitespace-nowrap rounded-md border">
                <div className="flex w-max space-x-4 p-4">
                    {slots.map((slide, idx) => {
                        const isGenerating = generatingSlide === slide.slide_number

                        return (
                            <Card key={slide.slide_number} className="w-[280px] shrink-0 p-4 flex flex-col gap-3 bg-muted/10 h-auto min-h-[320px]">
                                <div className="flex justify-between items-center">
                                    <Badge variant="outline">Slide {slide.slide_number}</Badge>
                                    {slide.slide_number === 1 && <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Hook</Badge>}
                                    {slide.slide_number === slots.length && <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">CTA</Badge>}
                                </div>

                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Title</p>
                                    <h4 className="font-bold text-sm whitespace-normal leading-snug">{slide.title}</h4>
                                </div>

                                <div className="space-y-1 flex-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Content</p>
                                    <p className="text-xs text-muted-foreground whitespace-normal leading-relaxed overflow-y-auto max-h-[60px]">
                                        {slide.content}
                                    </p>
                                </div>



                                {slide.image_prompt && (
                                    <div className="space-y-2 pt-2 border-t">
                                        <div className="p-2 bg-muted/30 rounded text-[10px] text-muted-foreground border border-dashed border-muted-foreground/30 whitespace-normal">
                                            🖼️ {slide.image_prompt.slice(0, 50)}...
                                        </div>
                                        <div className="flex gap-2">
                                            {onGenerateImage && !slide.imageUrl && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full text-xs h-8"
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
            <div className="flex flex-col gap-3 p-4 border rounded-md bg-muted/20">
                {caption && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-sm">Target Caption</h4>
                            <button
                                type="button"
                                className="p-1 hover:bg-muted rounded text-muted-foreground"
                                onClick={copyCaption}
                                title="Copy caption"
                            >
                                {copiedCaption ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                )}
                            </button>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{caption}</p>
                    </div>
                )}

                {onSchedule && (
                    <Button
                        onClick={handleScheduleAll}
                        className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                    >
                        Schedule Carousel Post
                    </Button>
                )}
            </div>
        </div >
    )
}
