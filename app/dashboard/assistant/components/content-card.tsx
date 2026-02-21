"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, MessageCircle, Calendar } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface ContentCardProps {
    id: string
    title: string
    body: string
    workspaceId?: string
    onGenerateImage: (id: string, text: string) => void
    onRefine: (id: string, text: string) => void
    onSchedule: (id: string, text: string, image?: string) => void
}

export function ContentCard({ id, title, body, workspaceId, onGenerateImage, onRefine, onSchedule }: ContentCardProps) {
    // Local state for in-card image generation
    const [generatedImage, setGeneratedImage] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)

    const { toast } = useToast()

    const handleGenerateInternal = async () => {
        if (isGenerating) return
        setIsGenerating(true)

        try {
            const response = await fetch('/api/assistant/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    functionName: 'generate-image',
                    body: {
                        prompt: `Create an image for this social media post: "${body}"`,
                        workspaceId
                    }
                })
            })

            const payload = await response.json().catch(() => ({}))

            if (response.status === 401) {
                throw new Error("Session expired. Please log in again.")
            }
            if (!response.ok) {
                throw new Error(payload?.error || "Failed to generate image")
            }

            const data = payload?.data
            if (data?.error) throw new Error(data.error)

            if (data?.result?.imageUrl) {
                setGeneratedImage(data.result.imageUrl)
            } else {
                throw new Error("No image generated")
            }
        } catch (e: any) {
            console.error("Failed to generate image in card", e)
            toast({
                variant: "destructive",
                title: "Image Generation Failed",
                description: e.message || "Please try again."
            })
        } finally {
            setIsGenerating(false)
        }
    }

    const handleDownload = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!generatedImage) return
        const link = document.createElement('a')
        link.href = generatedImage
        link.download = `idea-image-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    return (
        <Card className="p-4 bg-muted/30 border-muted-foreground/20 hover:scale-[1.02] transition-transform duration-200 flex flex-col h-full">
            <h3 className="font-bold text-lg mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">{body}</p>

            {/* In-Card Image Area */}
            {(generatedImage || isGenerating) && (
                <div className="relative aspect-square w-full rounded-md overflow-hidden bg-black/5 mb-4 border border-border">
                    {isGenerating ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-xs">Generating image...</span>
                        </div>
                    ) : (
                        <div className="group relative w-full h-full">
                            <img src={generatedImage!} alt="Generated" className="w-full h-full object-cover" />
                            <Button
                                variant="secondary"
                                size="sm"
                                className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                                onClick={handleDownload}
                            >
                                Download
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <div className="flex gap-2 mt-auto pt-2 border-t border-muted-foreground/10">
                {!generatedImage ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs gap-1 h-8"
                        onClick={handleGenerateInternal}
                        disabled={isGenerating}
                    >
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        Generate
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs gap-1 h-8"
                        onClick={handleGenerateInternal}
                        disabled={isGenerating}
                    >
                        <Sparkles className="w-3 h-3 text-blue-400" />
                        Regenerate
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs gap-1 h-8"
                    onClick={() => onRefine(id, body)}
                >
                    <MessageCircle className="w-3 h-3 text-emerald-400" />
                    Ask AI
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 text-xs gap-1 h-8"
                    // Pass generated image if available, else null/undefined
                    onClick={() => onSchedule(id, body, generatedImage || undefined)}
                >
                    <Calendar className="w-3 h-3 text-purple-400" />
                    Schedule Post
                </Button>
            </div>
        </Card>
    )
}
