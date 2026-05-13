"use client"

import { BarChart3, Clock3, FlaskConical, Hash, Lightbulb, ListChecks, Sparkles, TrendingUp } from "lucide-react"
import { ContentIntelligenceTrendReport } from "./content-intelligence-trend-report"
import type { AnalyticsInsightsResult, AnalyticsPatternCard, ContentPlatform, IntelligenceConfidence } from "@/lib/content-intelligence/types"

interface ContentIntelligenceInsightsProps {
    data?: AnalyticsInsightsResult
    isLoading?: boolean
    error?: Error
    platform?: ContentPlatform | "all"
}

const confidenceStyles: Record<IntelligenceConfidence, { label: string; className: string }> = {
    high: {
        label: "High",
        className: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    },
    medium: {
        label: "Medium",
        className: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    },
    low: {
        label: "Low",
        className: "border-white/10 bg-white/5 text-white/55",
    },
}

const patternIcons = {
    topic: Lightbulb,
    format: ListChecks,
    time: Clock3,
    caption: BarChart3,
    hashtag: Hash,
}

const trendResearchPanelEnabled = process.env.NEXT_PUBLIC_ENABLE_TREND_RESEARCH_PANEL === "true"

function confidenceBadge(confidence: IntelligenceConfidence) {
    const style = confidenceStyles[confidence]
    return (
        <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.className}`}>
            {style.label}
        </span>
    )
}

function PatternCard({ pattern }: { pattern: AnalyticsPatternCard }) {
    const Icon = patternIcons[pattern.type]

    return (
        <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.035] p-3">
            <div className="flex items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-100">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{pattern.title}</p>
                        {confidenceBadge(pattern.confidence)}
                    </div>
                    <p className="mt-1 break-words text-sm font-semibold text-white/88">{pattern.value}</p>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/48">{pattern.summary}</p>
                </div>
            </div>
        </div>
    )
}

export function ContentIntelligenceInsights({ data, isLoading, error, platform = "all" }: ContentIntelligenceInsightsProps) {
    if (isLoading && !data) {
        return (
            <section className="rounded-xl border border-white/8 bg-[#151620] p-5">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-cyan-200" />
                    <h2 className="text-sm font-semibold text-white/82">Content Intelligence</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((item) => (
                        <div key={item} className="h-24 animate-pulse rounded-lg bg-white/[0.045]" />
                    ))}
                </div>
            </section>
        )
    }

    if (error) {
        return (
            <section className="rounded-xl border border-amber-300/15 bg-amber-400/[0.055] p-5">
                <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-amber-100">Content Intelligence unavailable</h2>
                        <p className="mt-1 text-xs leading-relaxed text-white/48">Analytics still loads, but the insight layer could not be generated for this view.</p>
                    </div>
                </div>
            </section>
        )
    }

    if (!data) return null

    const primaryInsight = data.whatIsWorking[0] || data.growthInsights[0]
    const secondaryInsight = data.whatIsWorking[1] || data.growthInsights[1]
    const evidence = data.evidence.slice(0, 3)

    return (
        <section className="rounded-xl border border-white/8 bg-[#151620] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 shrink-0 text-cyan-200" />
                        <h2 className="truncate text-sm font-semibold text-white/86">Content Intelligence</h2>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-white/45">
                        {data.fallbackLevel === "personalized"
                            ? "Personalized from synced workspace analytics."
                            : data.fallbackLevel === "mixed"
                                ? "Mixing early account signals with conservative guidance."
                                : "Waiting for enough analytics history to personalize."}
                    </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-100">
                    {data.fallbackLevel}
                </span>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
                {primaryInsight && (
                    <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.035] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-100">
                                    <TrendingUp className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-semibold text-white/88">{primaryInsight.title}</p>
                                    <p className="mt-1 text-xs leading-relaxed text-white/50">{primaryInsight.summary}</p>
                                </div>
                            </div>
                            {confidenceBadge(primaryInsight.confidence)}
                        </div>
                        {primaryInsight.metricLabel && primaryInsight.metricValue && (
                            <div className="mt-3 flex items-center justify-between rounded-lg bg-black/16 px-3 py-2 text-xs">
                                <span className="text-white/42">{primaryInsight.metricLabel}</span>
                                <span className="font-semibold text-white/80">{primaryInsight.metricValue}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="min-w-0 rounded-lg border border-white/8 bg-white/[0.035] p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-fuchsia-400/10 text-fuchsia-100">
                                <FlaskConical className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                                <p className="break-words text-sm font-semibold text-white/88">
                                    {data.whatToTryNext[0]?.title || secondaryInsight?.title || "Build the next analytics sample"}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-white/50">
                                    {data.whatToTryNext[0]?.description || secondaryInsight?.summary || "Publish a few comparable posts so SwiftFlow can detect account-specific patterns."}
                                </p>
                            </div>
                        </div>
                        {confidenceBadge(data.whatToTryNext[0]?.confidence || secondaryInsight?.confidence || "low")}
                    </div>
                </div>
            </div>

            {data.patterns.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {data.patterns.slice(0, 5).map((pattern) => (
                        <PatternCard key={pattern.id} pattern={pattern} />
                    ))}
                </div>
            )}

            {evidence.length > 0 && (
                <div className="mt-4 rounded-lg border border-white/8 bg-black/12 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">Evidence</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                        {evidence.map((item, index) => (
                            <div key={`${item.sourceType}-${index}`} className="min-w-0 text-xs leading-relaxed text-white/48">
                                <span className="font-semibold text-white/68">{item.title}: </span>
                                <span>{item.summary}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {trendResearchPanelEnabled && <ContentIntelligenceTrendReport data={data} platform={platform} />}
        </section>
    )
}
