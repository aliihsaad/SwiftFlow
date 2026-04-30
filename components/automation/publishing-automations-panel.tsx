"use client"

import { useState } from "react"
import useSWR from "swr"
import { CalendarClock, Facebook, Instagram, Loader2, PauseCircle, Play, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import type { PublishingAutomation } from "@/types/publishing-automation"
import type { Platform } from "@/types/post"

interface PublishingAutomationsPanelProps {
    readOnly?: boolean
}

interface PublishingAutomationsResponse {
    automations: PublishingAutomation[]
}

const fetcher = async (url: string) => {
    const response = await fetch(url)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Failed to fetch")
    return data
}

const PANEL_THEME = {
    panel: "#151620",
    panelAlt: "#1b1d28",
    border: "rgba(255,255,255,0.08)",
    muted: "rgba(255,255,255,0.42)",
}

function platformMode(platforms: Platform[]) {
    if (platforms.length === 1 && platforms[0] === "facebook") return "facebook_only"
    if (platforms.length === 1 && platforms[0] === "instagram") return "instagram_only"
    return "facebook_and_instagram"
}

function mediaMode(platforms: Platform[]) {
    return platforms.includes("instagram") ? "generated_image" : "none"
}

function formatPlatforms(platforms: Platform[]) {
    if (platforms.length === 2) return "Facebook + Instagram"
    return platforms[0] === "instagram" ? "Instagram" : "Facebook"
}

export function PublishingAutomationsPanel({ readOnly = false }: PublishingAutomationsPanelProps) {
    const { toast } = useToast()
    const { data, error, isLoading, mutate } = useSWR<PublishingAutomationsResponse>(
        "/api/publishing-automations",
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )
    const [open, setOpen] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [runningIds, setRunningIds] = useState<string[]>([])
    const [name, setName] = useState("AI weekly content queue")
    const [contentGoal, setContentGoal] = useState("")
    const [brandVoice, setBrandVoice] = useState("")
    const [visualStyle, setVisualStyle] = useState("")
    const [platforms, setPlatforms] = useState<Platform[]>(["facebook", "instagram"])

    const automations = data?.automations || []

    const togglePlatform = (platform: Platform) => {
        setPlatforms((current) => {
            if (current.includes(platform)) {
                return current.length === 1 ? current : current.filter((entry) => entry !== platform)
            }
            return [...current, platform]
        })
    }

    const createAutomation = async () => {
        setIsSaving(true)
        try {
            const selectedMediaMode = mediaMode(platforms)
            const response = await fetch("/api/publishing-automations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name,
                    platforms,
                    approval_mode: "manual_review",
                    content_goal: contentGoal,
                    brand_voice: brandVoice,
                    content_pillars: [],
                    excluded_terms: [],
                    cta_config: { enabled: false },
                    media_policy: {
                        require_media: platforms.includes("instagram"),
                        allow_generated_image: selectedMediaMode === "generated_image",
                        allow_carousel: false,
                        manual_media_required_for_instagram: false,
                    },
                    consistency_config: {
                        brand_voice_source: brandVoice ? "custom_override" : "workspace_profile",
                        brand_voice_override: brandVoice,
                        visual_style_prompt: visualStyle,
                        design_reference_asset_ids: [],
                        color_palette: [],
                        typography_notes: "",
                        history_window_days: 45,
                        recent_posts_limit: 12,
                        avoid_repeated_topics: true,
                        avoid_repeated_captions: true,
                        prefer_successful_patterns: false,
                    },
                    workflow_config: {
                        idea_mode: "generate_new",
                        caption_mode: "generate",
                        media_mode: selectedMediaMode,
                        platform_mode: platformMode(platforms),
                        caption_strategy: "same_caption",
                        approval_mode: "manual_review",
                        schedule_mode: "manual_run_only",
                    },
                    schedule_config: {
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                    },
                    daily_cap: 1,
                }),
            })

            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || "Failed to create publishing automation")

            toast({
                title: "Publishing automation created",
                description: "It is draft-only for now. Use Run Draft to generate a reviewable post.",
            })
            setOpen(false)
            setContentGoal("")
            mutate()
        } catch (error: unknown) {
            toast({
                title: "Create failed",
                description: error instanceof Error ? error.message : "Failed to create publishing automation",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    const runDraft = async (automationId: string) => {
        setRunningIds((current) => current.includes(automationId) ? current : [...current, automationId])
        try {
            const response = await fetch(`/api/publishing-automations/${automationId}/run-now`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "draft" }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || "Failed to generate draft")

            toast({
                title: "Draft generated",
                description: "The generated post was saved as a draft for review.",
            })
            mutate()
        } catch (error: unknown) {
            toast({
                title: "Run failed",
                description: error instanceof Error ? error.message : "Failed to generate draft",
                variant: "destructive",
            })
        } finally {
            setRunningIds((current) => current.filter((id) => id !== automationId))
        }
    }

    return (
        <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>
                        Publishing Automations
                    </h2>
                    <p className="text-xs mt-1" style={{ color: PANEL_THEME.muted }}>
                        AI content workflows that generate reviewable drafts using approved publishing permissions.
                    </p>
                </div>
                <Button
                    size="sm"
                    disabled={readOnly}
                    onClick={() => setOpen(true)}
                    className="gap-2"
                    style={{ background: "linear-gradient(135deg, #22c55e, #38bdf8)", color: "#061014" }}
                >
                    <Sparkles className="h-4 w-4" />
                    New AI Publishing
                </Button>
            </div>

            <div className="grid gap-3">
                {isLoading && (
                    <div className="rounded-xl p-4 text-sm" style={{ background: PANEL_THEME.panel, border: `1px solid ${PANEL_THEME.border}`, color: PANEL_THEME.muted }}>
                        Loading publishing automations...
                    </div>
                )}
                {error && (
                    <div className="rounded-xl p-4 text-sm" style={{ background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.18)", color: "#fca5a5" }}>
                        Failed to load publishing automations.
                    </div>
                )}
                {!isLoading && !error && automations.length === 0 && (
                    <div className="rounded-xl p-5" style={{ background: PANEL_THEME.panel, border: `1px dashed ${PANEL_THEME.border}` }}>
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.18)" }}>
                                <Wand2 className="h-5 w-5" style={{ color: "#86efac" }} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>
                                    No publishing automations yet
                                </p>
                                <p className="text-xs mt-1 max-w-2xl" style={{ color: PANEL_THEME.muted }}>
                                    Create one to generate consistent, brand-aware Facebook and Instagram drafts from the existing AI content functions.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
                {automations.map((automation) => {
                    const isRunning = runningIds.includes(automation.id)
                    return (
                        <div
                            key={automation.id}
                            className="rounded-xl p-4"
                            style={{ background: PANEL_THEME.panel, border: `1px solid ${PANEL_THEME.border}` }}
                        >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-semibold truncate" style={{ color: "rgba(255,255,255,0.86)" }}>
                                            {automation.name}
                                        </p>
                                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.18)", color: "#bbf7d0" }}>
                                            {automation.is_active ? <Play className="h-3 w-3" /> : <PauseCircle className="h-3 w-3" />}
                                            {automation.is_active ? "Active" : "Paused"}
                                        </span>
                                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]" style={{ background: "rgba(56,189,248,0.10)", border: "1px solid rgba(56,189,248,0.18)", color: "#bae6fd" }}>
                                            <CalendarClock className="h-3 w-3" />
                                            Draft-only
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 line-clamp-2" style={{ color: PANEL_THEME.muted }}>
                                        {automation.content_goal}
                                    </p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {automation.platforms.includes("facebook") && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border border-cyan-300/20 text-cyan-100">
                                                <Facebook className="h-3 w-3" /> Facebook
                                            </span>
                                        )}
                                        {automation.platforms.includes("instagram") && (
                                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border border-rose-300/20 text-rose-100">
                                                <Instagram className="h-3 w-3" /> Instagram
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    disabled={readOnly || isRunning}
                                    onClick={() => runDraft(automation.id)}
                                    className="gap-2"
                                    style={{ background: PANEL_THEME.panelAlt, border: `1px solid ${PANEL_THEME.border}`, color: "rgba(255,255,255,0.82)" }}
                                >
                                    {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                                    {isRunning ? "Generating..." : "Run Draft"}
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-2xl" style={{ background: PANEL_THEME.panel, border: `1px solid ${PANEL_THEME.border}` }}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.9)" }}>
                            <Sparkles className="h-5 w-5" style={{ color: "#86efac" }} />
                            New AI Publishing Automation
                        </DialogTitle>
                        <DialogDescription style={{ color: PANEL_THEME.muted }}>
                            Start with a draft-only automation. It uses brand/profile context, consistency prompts, and recent post history.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={name} onChange={(event) => setName(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Platforms</Label>
                            <div className="flex flex-wrap gap-2">
                                {(["facebook", "instagram"] as Platform[]).map((platform) => (
                                    <button
                                        key={platform}
                                        type="button"
                                        onClick={() => togglePlatform(platform)}
                                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition"
                                        style={{
                                            background: platforms.includes(platform) ? "rgba(56,189,248,0.14)" : PANEL_THEME.panelAlt,
                                            border: platforms.includes(platform) ? "1px solid rgba(56,189,248,0.32)" : `1px solid ${PANEL_THEME.border}`,
                                            color: "rgba(255,255,255,0.8)",
                                        }}
                                    >
                                        {platform === "facebook" ? <Facebook className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
                                        {platform}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px]" style={{ color: PANEL_THEME.muted }}>
                                Selected: {formatPlatforms(platforms)}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>Content Goal</Label>
                            <Textarea
                                value={contentGoal}
                                onChange={(event) => setContentGoal(event.target.value)}
                                placeholder="Example: Generate educational posts for small business owners about automating their social media workflow."
                                rows={4}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Brand Voice Override</Label>
                            <Textarea
                                value={brandVoice}
                                onChange={(event) => setBrandVoice(event.target.value)}
                                placeholder="Optional. Example: Direct, practical, confident, no hype, short sentences."
                                rows={3}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Design Consistency Prompt</Label>
                            <Textarea
                                value={visualStyle}
                                onChange={(event) => setVisualStyle(event.target.value)}
                                placeholder="Optional. Example: Clean product-led visuals, green/cyan accents, soft gradients, minimal text overlays, consistent rounded cards."
                                rows={3}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                            Cancel
                        </Button>
                        <Button onClick={createAutomation} disabled={isSaving || !name.trim() || !contentGoal.trim()} className="gap-2">
                            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            Create
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </section>
    )
}
