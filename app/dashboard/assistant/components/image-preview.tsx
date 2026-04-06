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
        <Card className="overflow-hidden border-muted-foreground/20">
            <div className="relative aspect-square w-full bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={imageUrl}
                    alt="AI Generated"
                    className="object-cover w-full h-full"
                />
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-border bg-card p-3 sm:grid-cols-[1fr_1fr_auto]">
                <Button
                    variant="outline"
                    size="sm"
                    className="min-w-0 gap-2 text-xs"
                    onClick={() => onDownload(imageUrl)}
                >
                    <Download className="w-3 h-3" />
                    <span className="truncate">Download</span>
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="min-w-0 gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => onUseInPost(imageUrl)}
                >
                    <PlusSquare className="w-3 h-3" />
                    <span className="truncate">Use in Post</span>
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="col-span-2 h-8 w-full sm:col-span-1 sm:w-8"
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
