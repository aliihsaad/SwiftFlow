"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, RefreshCw, PlusSquare } from "lucide-react"

interface ImagePreviewProps {
    id: string
    imageUrl: string
    promptUsed: string
    onDownload: (url: string) => void
    onUseInPost: (url: string) => void
    onRegenerate: (prompt: string) => void
}

export function ImagePreview({
    id,
    imageUrl,
    promptUsed,
    onDownload,
    onUseInPost,
    onRegenerate
}: ImagePreviewProps) {
    return (
        <Card className="w-full min-w-0 overflow-hidden border-white/10 bg-[#1b1d28] text-white/85" data-image-id={id}>
            <div className="relative aspect-square w-full bg-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt="AI Generated"
                    className="h-full w-full object-cover"
                />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-white/10 bg-[#151620] p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-10 min-w-0 gap-2 border-white/10 bg-white/5 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:h-9"
                    onClick={() => onDownload(imageUrl)}
                >
                    <Download className="w-3 h-3" />
                    <span className="truncate">Download</span>
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="h-10 min-w-0 gap-2 border border-cyan-300/20 bg-cyan-400/15 text-xs text-cyan-50 hover:bg-cyan-400/20 sm:h-9"
                    onClick={() => onUseInPost(imageUrl)}
                >
                    <PlusSquare className="w-3 h-3" />
                    <span className="truncate">Use in Post</span>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-2 h-10 w-full text-white/65 hover:bg-white/10 hover:text-white sm:col-span-1 sm:h-9 sm:w-9"
                    onClick={() => onRegenerate(promptUsed)}
                    title="Regenerate"
                >
                    <RefreshCw className="w-3 h-3" />
                    <span className="ml-2 text-xs sm:hidden">Regenerate</span>
                </Button>
            </div>
        </Card>
    )
}
