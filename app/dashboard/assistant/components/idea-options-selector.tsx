"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sparkles, Zap, Type, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface IdeaOptionsSelectorProps {
    onGenerate: (type: 'auto' | 'custom', count: number, topic?: string, research?: boolean) => void
    isLoading?: boolean
}

export function IdeaOptionsSelector({ onGenerate, isLoading }: IdeaOptionsSelectorProps) {
    const [source, setSource] = useState<'auto' | 'custom'>('auto')
    const [topic, setTopic] = useState("")
    const [count, setCount] = useState(5)
    const [research, setResearch] = useState(false)

    const handleGenerate = () => {
        if (source === 'custom' && !topic.trim()) return
        onGenerate(source, count, topic, research)
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

                {/* Research First Toggle */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-white/50">Research Mode</Label>
                    <button
                        onClick={() => setResearch(!research)}
                        className={cn(
                            "flex w-full items-center gap-3 p-3 rounded-lg border-2 transition-all",
                            research
                                ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                                : "border-white/10 bg-[#151620] text-white/70 hover:border-amber-300/15 hover:bg-white/5"
                        )}
                    >
                        <div className={cn(
                            "flex items-center justify-center w-8 h-8 rounded-md transition-colors",
                            research ? "bg-amber-400/20" : "bg-white/5"
                        )}>
                            <Search className="w-4 h-4" />
                        </div>
                        <div className="flex-1 text-left">
                            <span className="text-sm font-medium block">Research First 🔍</span>
                            <span className={cn(
                                "text-xs transition-colors",
                                research ? "text-amber-200/70" : "text-white/40"
                            )}>
                                AI will research current trends before generating
                            </span>
                        </div>
                        <div className={cn(
                            "w-9 h-5 rounded-full transition-colors relative",
                            research ? "bg-amber-400/40" : "bg-white/10"
                        )}>
                            <div className={cn(
                                "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                                research ? "left-[18px] bg-amber-300" : "left-0.5 bg-white/40"
                            )} />
                        </div>
                    </button>
                </div>

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
                className="w-full gap-2 border border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20"
                size="lg"
                onClick={handleGenerate}
                disabled={isLoading || (source === 'custom' && !topic.trim())}
            >
                {isLoading ? (
                    <span className="animate-spin text-xl">✨</span>
                ) : research ? (
                    <Search className="w-4 h-4" />
                ) : (
                    <Sparkles className="w-4 h-4" />
                )}
                {research ? 'Research & Generate' : 'Generate Ideas'}
            </Button>
        </div>
    )
}
