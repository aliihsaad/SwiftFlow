"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImageIcon, Loader2, RefreshCw, Download } from "lucide-react"

export function ImageGenerator() {
    const [prompt, setPrompt] = useState("")
    const [isGenerating, setIsGenerating] = useState(false)
    const [generatedImage, setGeneratedImage] = useState<string | null>(null)

    const handleGenerate = () => {
        if (!prompt) return
        setIsGenerating(true)
        // Simulate generation
        setTimeout(() => {
            setGeneratedImage("https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop&q=60")
            setIsGenerating(false)
        }, 2000)
    }

    return (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
            <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-purple-600" />
                <h3 className="text-sm font-semibold">AI Image Generator</h3>
            </div>

            <div className="flex gap-2">
                <Input
                    placeholder="Describe an image to generate..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isGenerating}
                />
                <Button onClick={handleGenerate} disabled={isGenerating || !prompt}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
                </Button>
            </div>

            {generatedImage && (
                <div className="relative group rounded-lg overflow-hidden border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={generatedImage} alt="Generated" className="w-full h-48 object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button size="sm" variant="secondary" onClick={handleGenerate}>
                            <RefreshCw className="mr-2 h-3 w-3" /> Retry
                        </Button>
                        <Button size="sm" variant="secondary">
                            <Download className="mr-2 h-3 w-3" /> Use
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
