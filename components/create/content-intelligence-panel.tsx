"use client"

import { Clock3, Hash, Info, Loader2, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { IntelligenceEvidence, PostIntelligenceResult, StrengthBand } from "@/lib/content-intelligence/types"

function bandLabel(band: StrengthBand): string {
    if (band === "needs_work") return "Needs work"
    return band.charAt(0).toUpperCase() + band.slice(1)
}

function scoreTone(score: number | undefined): string {
    if (typeof score !== "number") return "bg-white/15"
    if (score >= 85) return "bg-emerald-300"
    if (score >= 70) return "bg-cyan-300"
    if (score >= 50) return "bg-amber-300"
    return "bg-rose-300"
}

function formatSlot(iso: string): string {
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return "Recommended time"
    return date.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    })
}

function compactEvidence(evidence: IntelligenceEvidence[]): IntelligenceEvidence[] {
    const seen = new Set<string>()
    const result: IntelligenceEvidence[] = []
    for (const item of evidence) {
        const key = `${item.sourceType}:${item.title}:${item.summary}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(item)
        if (result.length >= 5) break
    }
    return result
}

export function ContentIntelligencePanel({
    result,
    loading,
    onAnalyze,
    onApplyHashtag,
    onApplySlot,
}: {
    result: PostIntelligenceResult | null
    loading: boolean
    onAnalyze: () => void
    onApplyHashtag: (tag: string) => void
    onApplySlot: (iso: string) => void
}) {
    if (!result && !loading) {
        return null
    }

    const score = result?.strength.score
    const evidence = compactEvidence(result?.evidence || [])

    return (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-white/80">
            <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/90">Content Intelligence</p>
                    <p className="truncate text-[11px] text-white/45">
                        {result ? `${bandLabel(result.strength.band)} confidence: ${result.strength.confidence}` : "Checking draft signals"}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={onAnalyze}
                    disabled={loading}
                    className="h-8 shrink-0 gap-1.5 px-2 text-xs text-cyan-100 hover:bg-cyan-400/10 hover:text-white"
                >
                    <Wand2 className="h-3.5 w-3.5" />
                    <span className="hidden min-[420px]:inline">Refresh</span>
                </Button>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-medium text-white/75">Post strength</span>
                    <span className="shrink-0 text-white/55">{score == null ? "--" : `${score}/100`}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                        className={cn("h-full rounded-full transition-all", scoreTone(score))}
                        style={{ width: `${Math.max(4, score || 8)}%` }}
                    />
                </div>
            </div>

            {result?.strength.topFixes.length ? (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-white/45">Top fixes</p>
                    <div className="space-y-1.5">
                        {result.strength.topFixes.map((fix) => (
                            <div key={fix.id} className="rounded-lg border border-white/8 bg-black/10 px-2.5 py-2">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Info className="h-3.5 w-3.5 shrink-0 text-amber-200" />
                                    <p className="truncate text-xs font-medium text-white/85">{fix.title}</p>
                                    <span className="ml-auto shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/45">
                                        {fix.impact}
                                    </span>
                                </div>
                                <p className="mt-1 text-[11px] leading-relaxed text-white/45">{fix.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}

            {result?.hashtags.length ? (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
                        <Hash className="h-3 w-3" />
                        Recommended hashtags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {result.hashtags.map((item) => (
                            <button
                                key={item.tag}
                                type="button"
                                onClick={() => onApplyHashtag(item.tag)}
                                className="max-w-full rounded-full border border-cyan-300/15 bg-cyan-300/10 px-2.5 py-1 text-[11px] text-cyan-100 transition-colors hover:bg-cyan-300/16"
                                title={item.reason}
                            >
                                <span className="block truncate">{item.tag}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {result?.slots.length ? (
                <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
                        <Clock3 className="h-3 w-3" />
                        Best times
                    </div>
                    <div className="grid gap-1.5">
                        {result.slots.slice(0, 3).map((slot) => (
                            <button
                                key={`${slot.startsAt}-${slot.platform}`}
                                type="button"
                                onClick={() => onApplySlot(slot.startsAt)}
                                className="flex min-w-0 items-center gap-2 rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                                title={slot.reason}
                            >
                                <span className="min-w-0 flex-1 truncate text-xs text-white/80">{formatSlot(slot.startsAt)}</span>
                                <span className="shrink-0 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/45">
                                    {slot.confidence}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {evidence.length > 0 ? (
                <details className="group rounded-lg border border-white/8 bg-black/10 px-2.5 py-2">
                    <summary className="cursor-pointer text-xs font-medium text-white/65 marker:text-white/35">
                        Evidence and confidence
                    </summary>
                    <div className="mt-2 space-y-2">
                        {evidence.map((item, index) => (
                            <div key={`${item.title}-${index}`} className="min-w-0 border-t border-white/8 pt-2 first:border-t-0 first:pt-0">
                                <p className="truncate text-[11px] font-medium text-white/75">{item.title}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{item.summary}</p>
                                <p className="mt-1 text-[10px] text-white/35">
                                    {item.sourceType} · {item.confidence} confidence
                                </p>
                            </div>
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    )
}
