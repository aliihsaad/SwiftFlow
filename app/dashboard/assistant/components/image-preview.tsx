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

            <div className="p-3 bg-card border-t border-border flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs gap-2"
                    onClick={() => onDownload(imageUrl)}
                >
                    <Download className="w-3 h-3" />
                    Download
                </Button>
                <Button
                    variant="default"
                    size="sm"
                    className="flex-1 text-xs gap-2 bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => onUseInPost(imageUrl)}
                >
                    <PlusSquare className="w-3 h-3" />
                    Use in Post
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRegenerate(promptUsed)}
                    title="Regenerate"
                >
                    <RefreshCw className="w-3 h-3" />
                </Button>
            </div>
        </Card>
    )
}
