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
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200 space-y-6 rounded-xl border border-white/10 bg-[#1b1d28] p-4 text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)]">
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-white/50">Inspiration Source</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSource('auto')}
                            className={cn(
                                "flex flex-col items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all hover:bg-accent/50",
                                source === 'auto'
                                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:border-cyan-300/15 hover:bg-white/5"
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
                                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:border-cyan-300/15 hover:bg-white/5"
                            )}
                        >
                            <Type className="w-5 h-5" />
                            <span className="text-sm font-medium">Custom Topic</span>
                        </button>
                    </div>
                </div>

                {source === 'custom' && (
                    <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <Label className="text-white/75">Topic or Keyword</Label>
                        <Input
                            placeholder="E.g., Summer Sale, Industry Trends..."
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            className="border-white/10 bg-[#151620] text-white/85 placeholder:text-white/25"
                        />
                    </div>
                )}

                <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-white/50">Number of Ideas</Label>
                    <div className="flex items-center gap-2">
                        {[3, 5, 10].map((num) => (
                            <button
                                key={num}
                                onClick={() => setCount(num)}
                                className={cn(
                                    "flex-1 h-9 rounded-md border text-sm font-medium transition-colors hover:bg-accent",
                                    count === num
                                        ? "border-cyan-300/25 bg-cyan-400/12 text-cyan-100 hover:bg-cyan-400/15"
                                        : "border-white/10 bg-[#151620] text-white/70 hover:bg-white/5"
                                )}
                            >
                                {num} Ideas
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <Button
                className="w-full gap-2 border border-cyan-300/20 bg-gradient-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
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
