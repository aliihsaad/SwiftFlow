"use client"

import { BarChart3, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PostIntelligenceResult } from "@/lib/content-intelligence/types"

export function ContentIntelligenceSummary({
    result,
    loading,
    onAnalyze,
}: {
    result: PostIntelligenceResult | null
    loading: boolean
    onAnalyze: () => void
}) {
    const score = result?.strength.score
    const band = result?.strength.band || "weak"
    const isStrong = typeof score === "number" && score >= 70

    return (
        <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div
                className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                    isStrong
                        ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-200"
                        : "border-amber-300/25 bg-amber-400/10 text-amber-200",
                )}
            >
                <BarChart3 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-white/85">
                    {score == null ? "Post Strength" : `Post Strength ${score}/100`}
                </p>
                <p className="truncate text-[11px] text-white/45">
                    {result?.strength.topFixes[0]?.title || "Analyze for score, hashtags, and best time"}
                </p>
            </div>
            <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onAnalyze}
                disabled={loading}
                className="h-8 shrink-0 gap-1.5 border-white/10 bg-white/5 px-2 text-xs text-white/75 hover:bg-white/10 hover:text-white min-[380px]:px-3"
            >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span className="hidden min-[380px]:inline">{loading ? "Checking" : band === "weak" ? "Analyze" : "Refresh"}</span>
            </Button>
        </div>
    )
}
