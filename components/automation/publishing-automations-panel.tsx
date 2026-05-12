"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { AlertTriangle, CalendarClock, CheckCircle2, Facebook, Instagram, Loader2, Palette, PauseCircle, Pencil, Play, Sparkles, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

interface BrandProfileResponse {
    business_name?: string
    industry?: string
    business_description?: string
    target_audience?: string
    brand_voice?: string
    unique_selling_points?: string[]
    content_themes?: string[]
    brand_colors?: {
        enabled?: boolean
        primary?: string
        secondary?: string
        accent?: string
    }
}

interface ImageModelRecommendationResponse {
    provider: string
    configuredModel: string | null
    effectiveModel: string | null
    effectiveModelLabel: string
    isRecommendedForText: boolean
    recommendedModels: Array<{ id: string; label: string }>
    message: string
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

function buildProfileGoal(profile?: BrandProfileResponse) {
    if (!profile) return ""
    const business = profile.business_name || "this brand"
    const audience = profile.target_audience ? ` for ${profile.target_audience}` : ""
    const themes = profile.content_themes?.length ? ` Focus on: ${profile.content_themes.slice(0, 3).join(", ")}.` : ""
    return `Create consistent social posts for ${business}${audience}.${themes}`.trim()
}

function buildProfileVisualStyle(profile?: BrandProfileResponse) {
    const colors = profile?.brand_colors
    const palette = colors?.enabled
        ? [colors.primary, colors.secondary, colors.accent].filter(Boolean).join(", ")
        : ""
    return [
        "Create a typography-led branded poster system, not stock-photo quote graphics.",
        palette ? `Use brand colors: ${palette}.` : "",
        "Use custom abstract backgrounds, expressive quote typography, recurring accent shapes, and one repeatable composition language so posts feel like one brand series.",
    ].filter(Boolean).join(" ")
}

export function PublishingAutomationsPanel({ readOnly = false }: PublishingAutomationsPanelProps) {
    const { toast } = useToast()
    const router = useRouter()
    const { data, error, isLoading, mutate } = useSWR<PublishingAutomationsResponse>(
        "/api/publishing-automations",
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )
    const { data: brandProfile } = useSWR<BrandProfileResponse>(
        "/api/brand-profile",
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )
    const { data: imageModelRecommendation } = useSWR<ImageModelRecommendationResponse>(
        "/api/publishing-automations/model-recommendation",
        fetcher,
        { revalidateOnFocus: false, dedupingInterval: 30000 }
    )
    const [open, setOpen] = useState(false)
    const [editingAutomation, setEditingAutomation] = useState<PublishingAutomation | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<PublishingAutomation | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [runningIds, setRunningIds] = useState<string[]>([])
    const [togglingIds, setTogglingIds] = useState<string[]>([])
    const [name, setName] = useState("AI weekly content queue")
    const [contentGoal, setContentGoal] = useState("")
    const [brandVoice, setBrandVoice] = useState("")
    const [visualStyle, setVisualStyle] = useState("")
    const [typographyNotes, setTypographyNotes] = useState("Editorial serif-style quote typography paired with a geometric sans-style attribution. Avoid generic Arial/Roboto-looking text.")
    const [selectedThemes, setSelectedThemes] = useState<string[]>([])
    const [brandVoiceSource, setBrandVoiceSource] = useState<"workspace_profile" | "custom_override" | "hybrid">("workspace_profile")
    const [platforms, setPlatforms] = useState<Platform[]>(["facebook", "instagram"])

    const automations = data?.automations || []
    const profileThemes = useMemo(() => brandProfile?.content_themes?.filter(Boolean) || [], [brandProfile?.content_themes])
    const hasBrandProfile = !!brandProfile?.business_name || !!brandProfile?.business_description || profileThemes.length > 0

    useEffect(() => {
        if (!open || !brandProfile) return
        if (editingAutomation) return
        if (!contentGoal) setContentGoal(buildProfileGoal(brandProfile))
        if (!visualStyle) setVisualStyle(buildProfileVisualStyle(brandProfile))
        if (selectedThemes.length === 0 && profileThemes.length > 0) setSelectedThemes(profileThemes.slice(0, 3))
    }, [open, brandProfile, contentGoal, visualStyle, selectedThemes.length, profileThemes, editingAutomation])

    const resetFormForCreate = () => {
        setEditingAutomation(null)
        setName("AI weekly content queue")
        setContentGoal(brandProfile ? buildProfileGoal(brandProfile) : "")
        setBrandVoice("")
        setVisualStyle(brandProfile ? buildProfileVisualStyle(brandProfile) : "")
        setTypographyNotes("Editorial serif-style quote typography paired with a geometric sans-style attribution. Avoid generic Arial/Roboto-looking text.")
        setSelectedThemes(profileThemes.slice(0, 3))
        setBrandVoiceSource("workspace_profile")
        setPlatforms(["facebook", "instagram"])
    }

    const openCreateDialog = () => {
        resetFormForCreate()
        setOpen(true)
    }

    const openEditDialog = (automation: PublishingAutomation) => {
        const consistency = automation.consistency_config || {}
        setEditingAutomation(automation)
        setName(automation.name)
        setContentGoal(automation.content_goal)
        setBrandVoice(consistency.brand_voice_override || automation.brand_voice || "")
        setVisualStyle(consistency.visual_style_prompt || "")
        setTypographyNotes(consistency.typography_notes || "Editorial serif-style quote typography paired with a geometric sans-style attribution. Avoid generic Arial/Roboto-looking text.")
        setSelectedThemes(automation.content_pillars || [])
        setBrandVoiceSource(consistency.brand_voice_source || "workspace_profile")
        setPlatforms(automation.platforms.length > 0 ? automation.platforms : ["facebook", "instagram"])
        setOpen(true)
    }

    const closeDialog = () => {
        setOpen(false)
        setEditingAutomation(null)
    }

    const togglePlatform = (platform: Platform) => {
        setPlatforms((current) => {
            if (current.includes(platform)) {
                return current.length === 1 ? current : current.filter((entry) => entry !== platform)
            }
            return [...current, platform]
        })
    }

    const toggleTheme = (theme: string) => {
        setSelectedThemes((current) => {
            if (current.includes(theme)) return current.filter((entry) => entry !== theme)
            return [...current, theme].slice(0, 8)
        })
    }

    const applyVisualPreset = (preset: "editorial" | "kinetic" | "gradient" | "minimal") => {
        const palette = brandProfile?.brand_colors?.enabled
            ? [brandProfile.brand_colors.primary, brandProfile.brand_colors.secondary, brandProfile.brand_colors.accent].filter(Boolean).join(", ")
            : "the workspace brand colors"
        const presets = {
            editorial: `Typography-led quote poster series using ${palette}. Custom abstract gradient or paper-grain background, large editorial quote lockup, small attribution, recurring corner accent mark. No stock photos.`,
            kinetic: `Bold kinetic typography system using ${palette}. Oversized cropped words, dynamic diagonal grid, high-contrast accent shapes, energetic but clean composition. No generic photo backgrounds.`,
            gradient: `Premium abstract gradient poster using ${palette}. Soft light fields, subtle grain, glassy shape layers, elegant quote typography, consistent small brand signature detail.`,
            minimal: `Minimal luxury quote card using ${palette}. Deep negative space, refined border or halo motif, high-contrast serif-style quote type, small geometric sans attribution.`,
        }
        const typography = {
            editorial: "High-contrast editorial serif-style quote typography with a compact geometric sans-style attribution.",
            kinetic: "Bold condensed display typography with a clean sans-style supporting line. Strong hierarchy, no generic default fonts.",
            gradient: "Elegant serif-style headline with small modern sans-style attribution. Premium magazine feel.",
            minimal: "Refined serif-style quote typography, generous spacing, small all-caps sans-style attribution.",
        }
        setVisualStyle(presets[preset])
        setTypographyNotes(typography[preset])
    }

    const buildAutomationPayload = () => {
        const selectedMediaMode = mediaMode(platforms)
        return {
            name,
            platforms,
            approval_mode: "manual_review",
            content_goal: contentGoal,
            brand_voice: brandVoiceSource === "workspace_profile" ? "" : brandVoice,
            content_pillars: selectedThemes,
            excluded_terms: [],
            cta_config: { enabled: false },
            media_policy: {
                require_media: platforms.includes("instagram"),
                allow_generated_image: selectedMediaMode === "generated_image",
                allow_carousel: false,
                manual_media_required_for_instagram: false,
            },
            consistency_config: {
                brand_voice_source: brandVoiceSource,
                brand_voice_override: brandVoiceSource === "workspace_profile" ? "" : brandVoice,
                visual_style_prompt: visualStyle,
                design_reference_asset_ids: editingAutomation?.consistency_config?.design_reference_asset_ids || [],
                color_palette: brandProfile?.brand_colors?.enabled
                    ? [brandProfile.brand_colors.primary, brandProfile.brand_colors.secondary, brandProfile.brand_colors.accent].filter((color): color is string => !!color)
                    : editingAutomation?.consistency_config?.color_palette || [],
                typography_notes: typographyNotes,
                history_window_days: editingAutomation?.consistency_config?.history_window_days || 45,
                recent_posts_limit: editingAutomation?.consistency_config?.recent_posts_limit || 12,
                avoid_repeated_topics: editingAutomation?.consistency_config?.avoid_repeated_topics ?? true,
                avoid_repeated_captions: editingAutomation?.consistency_config?.avoid_repeated_captions ?? true,
                prefer_successful_patterns: editingAutomation?.consistency_config?.prefer_successful_patterns ?? false,
            },
            workflow_config: {
                idea_mode: editingAutomation?.workflow_config?.idea_mode || "generate_new",
                caption_mode: editingAutomation?.workflow_config?.caption_mode || "generate",
                media_mode: selectedMediaMode,
                platform_mode: platformMode(platforms),
                caption_strategy: editingAutomation?.workflow_config?.caption_strategy || "same_caption",
                approval_mode: "manual_review",
                schedule_mode: "manual_run_only",
            },
            schedule_config: {
                timezone: editingAutomation?.schedule_config?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                posting_windows: editingAutomation?.schedule_config?.posting_windows,
                fixed_slots: editingAutomation?.schedule_config?.fixed_slots,
            },
            daily_cap: editingAutomation?.daily_cap || 1,
            ...(editingAutomation ? { is_active: editingAutomation.is_active } : {}),
        }
    }

    const saveAutomation = async () => {
        setIsSaving(true)
        try {
            const response = await fetch(editingAutomation ? `/api/publishing-automations/${editingAutomation.id}` : "/api/publishing-automations", {
                method: editingAutomation ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildAutomationPayload()),
            })

            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || `Failed to ${editingAutomation ? "update" : "create"} publishing automation`)

            toast({
                title: editingAutomation ? "Publishing automation updated" : "Publishing automation created",
                description: editingAutomation ? "Your workflow settings were saved." : "It is draft-only for now. Use Run Draft to generate a reviewable post.",
            })
            closeDialog()
            mutate()
        } catch (error: unknown) {
            toast({
                title: editingAutomation ? "Update failed" : "Create failed",
                description: error instanceof Error ? error.message : `Failed to ${editingAutomation ? "update" : "create"} publishing automation`,
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }

    const deleteAutomation = async () => {
        if (!deleteTarget) return
        setIsDeleting(true)
        try {
            const response = await fetch(`/api/publishing-automations/${deleteTarget.id}`, { method: "DELETE" })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || "Failed to delete publishing automation")
            toast({
                title: "Publishing automation deleted",
                description: "The workflow was removed. Existing generated drafts are unchanged.",
            })
            setDeleteTarget(null)
            mutate()
        } catch (error: unknown) {
            toast({
                title: "Delete failed",
                description: error instanceof Error ? error.message : "Failed to delete publishing automation",
                variant: "destructive",
            })
        } finally {
            setIsDeleting(false)
        }
    }

    const toggleAutomation = async (automation: PublishingAutomation) => {
        setTogglingIds((current) => current.includes(automation.id) ? current : [...current, automation.id])
        try {
            const nextActive = !automation.is_active
            const response = await fetch(`/api/publishing-automations/${automation.id}/toggle`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ is_active: nextActive }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || "Failed to update automation")
            toast({
                title: nextActive ? "Automation active" : "Automation paused",
                description: nextActive ? "It will generate reviewable drafts automatically." : "Automatic draft generation is paused.",
            })
            mutate()
        } catch (error: unknown) {
            toast({
                title: "Automation update failed",
                description: error instanceof Error ? error.message : "Failed to update automation",
                variant: "destructive",
            })
        } finally {
            setTogglingIds((current) => current.filter((id) => id !== automation.id))
        }
    }

    const runDraft = async (automationId: string) => {
        setRunningIds((current) => current.includes(automationId) ? current : [...current, automationId])
        let draftCreated = false
        try {
            const response = await fetch(`/api/publishing-automations/${automationId}/run-now`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mode: "draft" }),
            })
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || "Failed to generate draft")
            draftCreated = true

            const imageEndpoint = typeof payload?.image_generation?.endpoint === "string"
                ? payload.image_generation.endpoint
                : ""

            if (payload?.image_generation?.status === "pending" && imageEndpoint) {
                toast({
                    title: "Draft created",
                    description: "Generating and attaching the image now.",
                })

                const imageResponse = await fetch(imageEndpoint, { method: "POST" })
                const imagePayload = await imageResponse.json().catch(() => null)
                if (!imageResponse.ok) {
                    throw new Error(imagePayload?.error || "Draft was created, but image generation failed")
                }
            }

            toast({
                title: "Draft generated",
                description: imageEndpoint ? "The image was attached. Opening the Drafts tab for review." : "Opening the Drafts tab for review.",
            })
            router.push("/dashboard/scheduled?tab=drafts")
            mutate()
        } catch (error: unknown) {
            toast({
                title: draftCreated ? "Draft created, image failed" : "Run failed",
                description: error instanceof Error ? error.message : "Failed to generate draft",
                variant: "destructive",
            })
            if (draftCreated) router.push("/dashboard/scheduled?tab=drafts")
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
                    onClick={openCreateDialog}
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
                    const isToggling = togglingIds.includes(automation.id)
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
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        size="sm"
                                        disabled={readOnly || isRunning || isToggling}
                                        onClick={() => toggleAutomation(automation)}
                                        className="gap-2"
                                        style={{
                                            background: automation.is_active ? "rgba(245,158,11,0.10)" : "rgba(34,197,94,0.10)",
                                            border: automation.is_active ? "1px solid rgba(245,158,11,0.22)" : "1px solid rgba(34,197,94,0.22)",
                                            color: automation.is_active ? "#fde68a" : "#bbf7d0",
                                        }}
                                    >
                                        {isToggling ? <Loader2 className="h-4 w-4 animate-spin" /> : automation.is_active ? <PauseCircle className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                        {automation.is_active ? "Pause Auto" : "Start Auto"}
                                    </Button>
                                    <Button
                                        size="sm"
                                        disabled={readOnly}
                                        onClick={() => openEditDialog(automation)}
                                        className="gap-2"
                                        style={{ background: PANEL_THEME.panelAlt, border: `1px solid ${PANEL_THEME.border}`, color: "rgba(255,255,255,0.82)" }}
                                    >
                                        <Pencil className="h-4 w-4" />
                                        Edit
                                    </Button>
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
                                    <Button
                                        size="sm"
                                        disabled={readOnly || isRunning}
                                        onClick={() => setDeleteTarget(automation)}
                                        className="gap-2"
                                        style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", color: "#fca5a5" }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : closeDialog()}>
                <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90vh]" style={{ background: PANEL_THEME.panel, border: `1px solid ${PANEL_THEME.border}` }}>
                    <DialogHeader className="border-b border-white/10 px-4 py-4 pr-12 text-left sm:px-6">
                        <DialogTitle className="flex min-w-0 items-center gap-2 text-base leading-snug sm:text-lg" style={{ color: "rgba(255,255,255,0.9)" }}>
                            <Sparkles className="h-5 w-5 shrink-0" style={{ color: "#86efac" }} />
                            {editingAutomation ? "Edit AI Publishing Automation" : "New AI Publishing Automation"}
                        </DialogTitle>
                        <DialogDescription style={{ color: PANEL_THEME.muted }}>
                            {editingAutomation ? "Update the workflow, platforms, brand voice, and visual consistency rules." : "Start with a draft-only automation. It uses brand/profile context, consistency prompts, and recent post history."}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
                        {hasBrandProfile && (
                            <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}>
                                <div className="flex items-start gap-3">
                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.20)" }}>
                                        <Sparkles className="h-4 w-4" style={{ color: "#86efac" }} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.88)" }}>
                                            Using your brand profile
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: PANEL_THEME.muted }}>
                                            {brandProfile?.business_name || "Workspace brand"}{brandProfile?.industry ? ` • ${brandProfile.industry}` : ""}{brandProfile?.brand_voice ? ` • ${brandProfile.brand_voice} voice` : ""}
                                        </p>
                                        <button
                                            type="button"
                                            className="mt-3 rounded-lg px-3 py-1.5 text-xs font-semibold"
                                            style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${PANEL_THEME.border}`, color: "rgba(255,255,255,0.78)" }}
                                            onClick={() => {
                                                setContentGoal(buildProfileGoal(brandProfile))
                                                setVisualStyle(buildProfileVisualStyle(brandProfile))
                                                setTypographyNotes("Editorial serif-style quote typography paired with a geometric sans-style attribution. Avoid generic Arial/Roboto-looking text.")
                                                setSelectedThemes(profileThemes.slice(0, 3))
                                                setBrandVoiceSource("workspace_profile")
                                                setBrandVoice("")
                                            }}
                                        >
                                            Fill from profile
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

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
                        {platforms.includes("instagram") && imageModelRecommendation && (
                            <div
                                className="rounded-xl p-4"
                                style={{
                                    background: imageModelRecommendation.isRecommendedForText ? "rgba(34,197,94,0.08)" : "rgba(245,158,11,0.08)",
                                    border: imageModelRecommendation.isRecommendedForText ? "1px solid rgba(34,197,94,0.18)" : "1px solid rgba(245,158,11,0.22)",
                                }}
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                                        style={{
                                            background: imageModelRecommendation.isRecommendedForText ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                                            border: imageModelRecommendation.isRecommendedForText ? "1px solid rgba(34,197,94,0.20)" : "1px solid rgba(245,158,11,0.24)",
                                        }}
                                    >
                                        {imageModelRecommendation.isRecommendedForText
                                            ? <CheckCircle2 className="h-4 w-4" style={{ color: "#86efac" }} />
                                            : <AlertTriangle className="h-4 w-4" style={{ color: "#fbbf24" }} />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold" style={{ color: "rgba(255,255,255,0.88)" }}>
                                            Image model: {imageModelRecommendation.effectiveModelLabel}
                                        </p>
                                        <p className="text-xs mt-1" style={{ color: PANEL_THEME.muted }}>
                                            {imageModelRecommendation.isRecommendedForText
                                                ? "Recommended for typography-heavy quote automation. Still review drafts before publishing."
                                                : "This model can misspell text in generated images. Automation will keep full text in captions and avoid rendering long quote text inside images."}
                                        </p>
                                        {!imageModelRecommendation.isRecommendedForText && imageModelRecommendation.recommendedModels.length > 0 && (
                                            <p className="text-[11px] mt-2" style={{ color: "#fde68a" }}>
                                                Recommended: {imageModelRecommendation.recommendedModels.map((model) => model.label).join(", ")}. Change it in Settings, AI Provider, Image Generation Model.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Content Goal</Label>
                            {profileThemes.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {profileThemes.slice(0, 10).map((theme) => {
                                        const selected = selectedThemes.includes(theme)
                                        return (
                                            <button
                                                key={theme}
                                                type="button"
                                                onClick={() => toggleTheme(theme)}
                                                className="rounded-full px-3 py-1 text-[11px] font-semibold"
                                                style={{
                                                    background: selected ? "rgba(34,197,94,0.16)" : PANEL_THEME.panelAlt,
                                                    border: selected ? "1px solid rgba(34,197,94,0.32)" : `1px solid ${PANEL_THEME.border}`,
                                                    color: selected ? "#bbf7d0" : "rgba(255,255,255,0.62)",
                                                }}
                                            >
                                                {theme}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                            <Textarea
                                value={contentGoal}
                                onChange={(event) => setContentGoal(event.target.value)}
                                placeholder="Example: Generate educational posts for small business owners about automating their social media workflow."
                                rows={4}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Brand Voice</Label>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {([
                                    ["workspace_profile", "Use profile", brandProfile?.brand_voice || "Workspace voice"],
                                    ["hybrid", "Blend", "Profile + extra instruction"],
                                    ["custom_override", "Custom", "Use only my rule"],
                                ] as const).map(([mode, title, description]) => (
                                    <button
                                        key={mode}
                                        type="button"
                                        onClick={() => setBrandVoiceSource(mode)}
                                        className="rounded-xl p-3 text-left"
                                        style={{
                                            background: brandVoiceSource === mode ? "rgba(56,189,248,0.13)" : PANEL_THEME.panelAlt,
                                            border: brandVoiceSource === mode ? "1px solid rgba(56,189,248,0.30)" : `1px solid ${PANEL_THEME.border}`,
                                        }}
                                    >
                                        <span className="block text-xs font-semibold" style={{ color: "rgba(255,255,255,0.82)" }}>{title}</span>
                                        <span className="block text-[11px] mt-1" style={{ color: PANEL_THEME.muted }}>{description}</span>
                                    </button>
                                ))}
                            </div>
                            {brandVoiceSource !== "workspace_profile" && (
                                <Textarea
                                    value={brandVoice}
                                    onChange={(event) => setBrandVoice(event.target.value)}
                                    placeholder="Example: Direct, practical, confident, no hype, short sentences."
                                    rows={3}
                                />
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label>Design Consistency Prompt</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {([
                                    ["editorial", "Editorial quote poster"],
                                    ["kinetic", "Bold type system"],
                                    ["gradient", "Abstract gradient"],
                                    ["minimal", "Minimal premium"],
                                ] as const).map(([preset, label]) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => applyVisualPreset(preset)}
                                        className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold"
                                        style={{ background: PANEL_THEME.panelAlt, border: `1px solid ${PANEL_THEME.border}`, color: "rgba(255,255,255,0.72)" }}
                                    >
                                        <Palette className="h-3.5 w-3.5" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <Textarea
                                value={visualStyle}
                                onChange={(event) => setVisualStyle(event.target.value)}
                                placeholder="Example: Typography-led quote poster series with custom abstract backgrounds, recurring accent shapes, and no stock-photo scenes."
                                rows={4}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Typography Direction</Label>
                            <Textarea
                                value={typographyNotes}
                                onChange={(event) => setTypographyNotes(event.target.value)}
                                placeholder="Example: High-contrast editorial serif-style quote typography with a compact geometric sans-style attribution."
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col-reverse gap-2 border-t border-white/10 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
                        <Button variant="outline" onClick={closeDialog} disabled={isSaving} className="w-full sm:w-auto">
                            Cancel
                        </Button>
                        <Button onClick={saveAutomation} disabled={isSaving || !name.trim() || !contentGoal.trim()} className="w-full gap-2 sm:w-auto">
                            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                            {editingAutomation ? "Save Changes" : "Create"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
            <AlertDialog open={!!deleteTarget} onOpenChange={(nextOpen) => !nextOpen && !isDeleting && setDeleteTarget(null)}>
                <AlertDialogContent className="border-white/10 bg-[#151620] text-white/85">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white/90">Delete publishing automation?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/55">
                            This removes &quot;{deleteTarget?.name}&quot; from automation. Existing draft posts generated by it will not be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting} className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            disabled={isDeleting}
                            onClick={(event) => {
                                event.preventDefault()
                                deleteAutomation()
                            }}
                            className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20"
                        >
                            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </section>
    )
}
