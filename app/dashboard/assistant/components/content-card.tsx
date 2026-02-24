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
        <Card className="flex h-full flex-col border-white/10 bg-[#1b1d28] p-4 text-white/85 transition-transform duration-200 hover:scale-[1.02] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_32px_rgba(0,0,0,0.2)]">
            <h3 className="mb-2 text-lg font-bold text-white/90">{title}</h3>
            <p className="mb-4 whitespace-pre-wrap text-sm text-white/50">{body}</p>

            {/* In-Card Image Area */}
            {(generatedImage || isGenerating) && (
                <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-md border border-white/10 bg-black/10">
                    {isGenerating ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
                            <span className="text-xs">Generating image...</span>
                        </div>
                    ) : (
                        <div className="group relative w-full h-full">
                            <img src={generatedImage!} alt="Generated" className="w-full h-full object-cover" />
                            <Button
                                variant="secondary"
                                size="sm"
                                className="absolute bottom-2 right-2 h-7 border-white/10 bg-[#151620]/90 text-xs text-white/75 opacity-0 transition-opacity hover:bg-[#151620] hover:text-white group-hover:opacity-100"
                                onClick={handleDownload}
                            >
                                Download
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
                {!generatedImage ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white"
                        onClick={handleGenerateInternal}
                        disabled={isGenerating}
                    >
                        <Sparkles className="h-3 w-3 text-cyan-300" />
                        <span className="truncate">Generate</span>
                    </Button>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white"
                        onClick={handleGenerateInternal}
                        disabled={isGenerating}
                    >
                        <Sparkles className="h-3 w-3 text-cyan-300" />
                        <span className="truncate">Regenerate</span>
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white"
                    onClick={() => onRefine(id, body)}
                >
                    <MessageCircle className="w-3 h-3 text-emerald-400" />
                    <span className="truncate">Ask AI</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-2 h-8 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:col-span-1"
                    // Pass generated image if available, else null/undefined
                    onClick={() => onSchedule(id, body, generatedImage || undefined)}
                >
                    <Calendar className="w-3 h-3 text-amber-300" />
                    <span className="truncate sm:hidden">Schedule</span>
                    <span className="hidden truncate sm:inline">Schedule Post</span>
                </Button>
            </div>
        </Card>
    )
}
