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
    onGenerateImage: (id: string, text: string) => Promise<string | null>
    onRefine: (id: string, text: string) => void
    onSchedule: (id: string, text: string, image?: string) => void
}

export function ContentCard({ id, title, body, onGenerateImage, onRefine, onSchedule }: ContentCardProps) {
    // Local state for in-card image generation
    const [generatedImage, setGeneratedImage] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [imageError, setImageError] = useState<string | null>(null)

    const { toast } = useToast()

    const handleGenerateInternal = async () => {
        if (isGenerating) return
        setImageError(null)
        setIsGenerating(true)

        try {
            const imageUrl = await onGenerateImage(id, body)
            if (imageUrl) {
                setGeneratedImage(imageUrl)
            } else {
                throw new Error("No image generated")
            }
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : "Please try again."
            console.error("Failed to generate image in card", e)
            setImageError(errorMessage)
            toast({
                variant: "destructive",
                title: "Image Generation Failed",
                description: errorMessage
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
        <Card className="flex h-full min-w-0 flex-col border-white/10 bg-[#1b1d28] p-4 text-white/85 transition-transform duration-200 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_32px_rgba(0,0,0,0.2)] sm:hover:scale-[1.02]">
            <h3 className="mb-2 break-words text-lg font-bold text-white/90">{title}</h3>
            <p className="mb-4 whitespace-pre-wrap break-words text-sm text-white/50">{body}</p>

            {/* In-Card Image Area */}
            {(generatedImage || isGenerating) && (
                <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-md border border-white/10 bg-black/10">
                    {isGenerating ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/50">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
                            <span className="text-xs">Generating image...</span>
                        </div>
                    ) : (
                        <div className="group relative h-full w-full">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={generatedImage!} alt="Generated" className="h-full w-full object-cover" />
                            <Button
                                variant="secondary"
                                size="sm"
                                className="absolute bottom-2 right-2 h-9 border-white/10 bg-[#151620]/90 text-xs text-white/75 opacity-100 transition-opacity hover:bg-[#151620] hover:text-white sm:h-7 sm:opacity-0 sm:group-hover:opacity-100"
                                onClick={handleDownload}
                            >
                                Download
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {imageError && (
                <div className="mb-4 rounded-md border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs leading-relaxed text-rose-200">
                    {imageError}
                </div>
            )}

            <div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
                {!generatedImage ? (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:h-8"
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
                        className="h-10 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:h-8"
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
                    className="h-10 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:h-8"
                    onClick={() => onRefine(id, body)}
                >
                    <MessageCircle className="w-3 h-3 text-emerald-400" />
                    <span className="truncate">Ask AI</span>
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="col-span-2 h-10 min-w-0 gap-1 border border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white sm:col-span-1 sm:h-8"
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
