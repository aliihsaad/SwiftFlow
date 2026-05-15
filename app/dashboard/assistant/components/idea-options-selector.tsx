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
        <div className="w-full max-w-none animate-in fade-in zoom-in-95 space-y-4 rounded-xl border border-white/10 bg-[#1b1d28] p-3 text-white/85 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_18px_48px_rgba(0,0,0,0.24)] duration-200 md:max-w-md md:space-y-6 md:p-4">
            <div className="space-y-3 md:space-y-4">
                <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-white/50">Inspiration Source</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setSource('auto')}
                            className={cn(
                                "flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-2 transition-all hover:bg-accent/50 md:min-h-20 md:gap-2 md:p-3",
                                source === 'auto'
                                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:border-cyan-300/15 hover:bg-white/5"
                            )}
                        >
                            <Zap className="h-4 w-4 md:h-5 md:w-5" />
                            <span className="text-xs font-medium md:text-sm">Auto Context</span>
                        </button>
                        <button
                            onClick={() => setSource('custom')}
                            className={cn(
                                "flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-2 transition-all hover:bg-accent/50 md:min-h-20 md:gap-2 md:p-3",
                                source === 'custom'
                                    ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-200"
                                    : "border-white/10 bg-[#151620] text-white/70 hover:border-cyan-300/15 hover:bg-white/5"
                            )}
                        >
                            <Type className="h-4 w-4 md:h-5 md:w-5" />
                            <span className="text-xs font-medium md:text-sm">Custom Topic</span>
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
                            className="h-10 border-white/10 bg-[#151620] text-[16px] text-white/85 placeholder:text-white/25 md:text-sm"
                        />
                    </div>
                )}

                {/* Research First Toggle */}
                <div className="space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wider text-white/50">Research Mode</Label>
                    <button
                        onClick={() => setResearch(!research)}
                        className={cn(
                            "flex min-h-12 w-full items-center gap-2.5 rounded-lg border-2 p-2.5 transition-all md:min-h-16 md:gap-3 md:p-3",
                            research
                                ? "border-amber-300/25 bg-amber-400/10 text-amber-200"
                                : "border-white/10 bg-[#151620] text-white/70 hover:border-amber-300/15 hover:bg-white/5"
                        )}
                    >
                        <div className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors md:h-8 md:w-8",
                            research ? "bg-amber-400/20" : "bg-white/5"
                        )}>
                            <Search className="h-3.5 w-3.5 md:h-4 md:w-4" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                            <span className="block text-xs font-medium md:text-sm">Research First 🔍</span>
                            <span className={cn(
                                "block break-words text-[11px] leading-snug transition-colors md:text-xs",
                                research ? "text-amber-200/70" : "text-white/40"
                            )}>
                                AI will research current trends before generating
                            </span>
                        </div>
                        <div className={cn(
                            "relative h-4 w-8 shrink-0 rounded-full transition-colors md:h-5 md:w-9",
                            research ? "bg-amber-400/40" : "bg-white/10"
                        )}>
                            <div className={cn(
                                "absolute top-0.5 h-3 w-3 rounded-full transition-all md:h-4 md:w-4",
                                research ? "left-[18px] bg-amber-300 md:left-[18px]" : "left-0.5 bg-white/40"
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
                                    "h-9 flex-1 rounded-md border text-xs font-medium transition-colors hover:bg-accent md:h-10 md:text-sm",
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
                className="min-h-10 w-full gap-2 border border-cyan-300/20 bg-linear-to-r from-cyan-400/20 via-cyan-300/10 to-amber-300/15 text-white hover:from-cyan-400/25 hover:to-amber-300/20 md:min-h-11"
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
