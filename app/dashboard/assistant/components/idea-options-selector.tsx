"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles, Zap, Type, Hash } from "lucide-react"
import { cn } from "@/lib/utils"

interface IdeaOptionsSelectorProps {
    onGenerate: (type: 'auto' | 'custom', count: number, topic?: string) => void
    isLoading?: boolean
}

export function IdeaOptionsSelector({ onGenerate, isLoading }: IdeaOptionsSelectorProps) {
    const [source, setSource] = useState<'auto' | 'custom'>('auto')
    const [topic, setTopic] = useState("")
    const [count, setCount] = useState(5)

    const handleGenerate = () => {
        if (source === 'custom' && !topic.trim()) return
        onGenerate(source, count, topic)
    }

    return (
        <div className="w-full max-w-md bg-card border rounded-xl p-4 space-y-6 shadow-sm animate-in fade-in zoom-in-95 duration-200">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Inspiration Source</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSource('auto')}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all hover:bg-accent/50",
                                source === 'auto'
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-muted bg-transparent hover:border-primary/50"
                            )}
                        >
                            <Zap className="w-5 h-5" />
                            <span className="text-sm font-medium">Auto Context</span>
                        </button>
                        <button
                            onClick={() => setSource('custom')}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all hover:bg-accent/50",
                                source === 'custom'
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-muted bg-transparent hover:border-primary/50"
                            )}
                        >
                            <Type className="w-5 h-5" />
                            <span className="text-sm font-medium">Custom Topic</span>
                        </button>
                    </div>
                </div>

                {source === 'custom' && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <Label>Topic or Keyword</Label>
                        <Input
                            placeholder="E.g., Summer Sale, Industry Trends..."
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="bg-background"
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Number of Ideas</Label>
                    <div className="flex items-center gap-2">
                        {[3, 5, 10].map((num) => (
                            <button
                                key={num}
                                onClick={() => setCount(num)}
                                className={cn(
                                    "flex-1 h-9 rounded-md border text-sm font-medium transition-colors hover:bg-accent",
                                    count === num
                                        ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                                        : "bg-transparent border-input"
                                )}
                            >
                                {num} Ideas
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <Button
                className="w-full gap-2"
                size="lg"
                onClick={handleGenerate}
                disabled={isLoading || (source === 'custom' && !topic.trim())}
            >
                {isLoading ? (
                    <span className="animate-spin text-xl">✨</span>
                ) : (
                    <Sparkles className="w-4 h-4" />
                )}
                Generate Ideas
            </Button>
        </div>
    )
}
