"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"

interface Slide {
    slide_number: number
    title: string
    content: string
    image_prompt?: string
}

interface CarouselPreviewProps {
    slots: Slide[]
}

export function CarouselPreview({ slots }: CarouselPreviewProps) {
    return (
        <ScrollArea className="w-full whitespace-nowrap rounded-md border">
            <div className="flex w-max space-x-4 p-4">
                {slots.map((slide) => (
                    <Card key={slide.slide_number} className="w-[250px] shrink-0 p-4 flex flex-col gap-3 bg-muted/10 h-[300px]">
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
                            <p className="text-xs text-muted-foreground whitespace-normal leading-relaxed overflow-y-auto max-h-[80px]">
                                {slide.content}
                            </p>
                        </div>

                        {slide.image_prompt && (
                            <div className="p-2 bg-muted/30 rounded text-[10px] text-muted-foreground border border-dashed border-muted-foreground/30 whitespace-normal">
                                🖼️ {slide.image_prompt.slice(0, 60)}...
                            </div>
                        )}
                    </Card>
                ))}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    )
}
