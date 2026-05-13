"use client"

import { useMemo, useState } from "react"
import { Lock, Search, Sparkles } from "lucide-react"
import { suggestTrendReportTopic } from "@/lib/content-intelligence/trend-topics"
import type {
    AnalyticsInsightsResult,
    ContentPlatform,
    ResearchProviderId,
    TrendReportResult,
} from "@/lib/content-intelligence/types"

type ProviderChoice = ResearchProviderId | "auto"

interface ContentIntelligenceTrendReportProps {
    data: AnalyticsInsightsResult
    platform: ContentPlatform | "all"
}

const providerOptions: Array<{ value: ProviderChoice; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "dataforseo", label: "DataForSEO" },
    { value: "serpapi", label: "SerpApi" },
    { value: "google_trends", label: "Google Trends" },
    { value: "openrouter", label: "OpenRouter" },
    { value: "gemini", label: "Gemini" },
    { value: "openai", label: "OpenAI" },
]

function statusLabel(report: TrendReportResult): string {
    if (!report.gating.allowed) return "Paid plan required"
    if (!report.providerStatus.configured) return "Provider unavailable"
    return report.findings.length > 0 ? "Report ready" : "No findings"
}

export function ContentIntelligenceTrendReport({ data, platform }: ContentIntelligenceTrendReportProps) {
    const suggestedTopic = useMemo(() => suggestTrendReportTopic(data), [data])
    const [topic, setTopic] = useState("")
    const [depth, setDepth] = useState<"standard" | "deep">("standard")
    const [provider, setProvider] = useState<ProviderChoice>("auto")
    const [report, setReport] = useState<TrendReportResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(false)

    const topicForRequest = topic.trim() || suggestedTopic

    const runReport = async () => {
        if (!topicForRequest || isLoading) return
        setIsLoading(true)
        setError(null)
        try {
            const response = await fetch("/api/content-intelligence/trend-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topic: topicForRequest,
                    platform,
                    depth,
                    provider,
                }),
            })
            const payload = await response.json().catch(() => ({}))
            if (!response.ok) throw new Error(payload?.error || "Trend report failed")
            setReport(payload as TrendReportResult)
        } catch (err) {
            setError(err instanceof Error ? err.message : "Trend report failed")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="mt-4 rounded-lg border border-white/8 bg-black/12 p-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 shrink-0 text-cyan-200" />
                        <p className="text-sm font-semibold text-white/86">Trend Research</p>
                    </div>
                    <p className="mt-1 break-words text-xs text-white/42">{topicForRequest}</p>
                </div>

                {report && (
                    <span className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/58">
                        {statusLabel(report)}
                    </span>
                )}
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_160px_160px_auto]">
                <input
                    value={topic}
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder={suggestedTopic}
                    className="min-h-10 min-w-0 rounded-lg border border-white/10 bg-white/[0.035] px-3 text-sm text-white/82 outline-none transition placeholder:text-white/28 focus:border-cyan-300/40 focus:bg-white/[0.055]"
                />

                <select
                    value={provider}
                    onChange={(event) => setProvider(event.target.value as ProviderChoice)}
                    className="min-h-10 rounded-lg border border-white/10 bg-[#161821] px-3 text-sm text-white/72 outline-none transition focus:border-cyan-300/40"
                >
                    {providerOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>

                <div className="grid min-h-10 grid-cols-2 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025]">
                    <button
                        type="button"
                        onClick={() => setDepth("standard")}
                        className={`text-xs font-semibold transition ${depth === "standard" ? "bg-cyan-400/14 text-cyan-100" : "text-white/45 hover:bg-white/[0.04]"}`}
                    >
                        Standard
                    </button>
                    <button
                        type="button"
                        onClick={() => setDepth("deep")}
                        className={`inline-flex items-center justify-center gap-1 text-xs font-semibold transition ${depth === "deep" ? "bg-amber-400/14 text-amber-100" : "text-white/45 hover:bg-white/[0.04]"}`}
                    >
                        <Lock className="h-3 w-3" />
                        Deep
                    </button>
                </div>

                <button
                    type="button"
                    onClick={runReport}
                    disabled={isLoading || !topicForRequest}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/14 disabled:cursor-not-allowed disabled:opacity-45"
                >
                    <Sparkles className={`h-4 w-4 ${isLoading ? "animate-pulse" : ""}`} />
                    {isLoading ? "Running" : "Run"}
                </button>
            </div>

            {error && (
                <div className="mt-3 rounded-lg border border-red-300/15 bg-red-400/[0.055] px-3 py-2 text-xs leading-relaxed text-red-100">
                    {error}
                </div>
            )}

            {report && !error && (
                <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.025] p-3">
                    {!report.gating.allowed ? (
                        <div className="flex items-start gap-2">
                            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-amber-100">Paid plan required</p>
                                <p className="mt-1 text-xs leading-relaxed text-white/46">
                                    Deep trend reports are locked until paid-plan entitlements are live.
                                </p>
                            </div>
                        </div>
                    ) : report.findings.length > 0 ? (
                        <div className="grid gap-2 md:grid-cols-3">
                            {report.findings.slice(0, 3).map((finding) => (
                                <div key={`${finding.provider}-${finding.url || finding.title}`} className="min-w-0 rounded-lg bg-black/16 p-3">
                                    <p className="line-clamp-2 text-sm font-semibold text-white/82">{finding.title}</p>
                                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/46">{finding.summary}</p>
                                    {finding.sourceQuality && (
                                        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100/70">
                                            Quality {finding.sourceQuality.score}/100
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs leading-relaxed text-white/48">
                            {report.evidence[0]?.summary || "No trend findings returned."}
                        </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35">
                        <span>Provider: {report.providerStatus.selected}</span>
                        <span>Depth: {report.depth}</span>
                        <span>Platform: {report.platform}</span>
                    </div>
                </div>
            )}
        </div>
    )
}
