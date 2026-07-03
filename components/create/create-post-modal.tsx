"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog"
import {
    Sheet,
    SheetContent,
    SheetTitle,
    SheetDescription,
} from "@/components/ui/sheet"
import { MediaUploadZone } from "./media-upload-zone"
import { SchedulingControls } from "./scheduling-controls"
import { InstagramPostPreview } from "./instagram-post-preview"
import { ContentIntelligencePanel } from "./content-intelligence-panel"
import { ContentIntelligenceSummary } from "./content-intelligence-summary"
import {
    X, Info, Plus, Instagram, Facebook, Monitor,
    RefreshCw, Smile,
    Wand2, Eye, Loader2, Lock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import EmojiPicker, { Theme } from "emoji-picker-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useWorkspacePermission } from "@/components/workspace/workspace-role-provider"
import type { PostIntelligenceResult } from "@/lib/content-intelligence/types"

interface CreatePostModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    postToEdit?: {
        id?: string
        status?: 'draft' | 'scheduled' | 'published' | string
        content?: string | null
        media_urls?: string[] | null
        scheduled_for?: string | null
    } | null
    workspaceId: string
    initialCaption?: string
    initialMedia?: string[]
    initialDate?: Date
}

const PLATFORMS: Array<{
    id: 'all' | 'instagram' | 'facebook'
    label: string
    icon: typeof Monitor
    color?: string
}> = [
    { id: 'all', label: 'All', icon: Monitor },
    { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
]

const SUGGESTED_HASHTAGS = ['#OpenSourceLife', '#CodingCommunity', '#SkilledDeveloper', '#CareerGrowth']

/** Strip raw SDK error prefixes and JSON blobs from AI error messages. */
function sanitizeAIError(msg: string): string {
    const normalized = msg
        .replace(/\[GoogleGenerativeAI Error\]:\s*/i, "")
        .replace(/Error fetching from https:\/\/[^\s:]+:\s*/i, "")
        .replace(/\[\{[\s\S]*?\}\]/g, "")
        .trim()

    if (/No endpoints found that support the requested output modalities|output modalities: image, text|No endpoints found for|model not found|not available/i.test(normalized)) {
        return "The selected image model is not currently available through your AI provider route. Choose another image model in Settings -> AI Provider."
    }
    if (/provider returned error/i.test(normalized)) {
        return "Your AI provider could not generate an image with the current image model. Try again or switch the image model in Settings -> AI Provider."
    }
    if (/invalid jwt|non-2xx status code|failed to invoke ai function/i.test(normalized)) {
        return "The AI service is temporarily unavailable. Please try again in a moment."
    }
    if (/unauthorized|forbidden/i.test(normalized)) {
        return "Your session expired or this workspace is not available right now. Refresh the page and try again."
    }
    if (/workspaceId is required|no active workspace found|workspace membership/i.test(normalized)) {
        return "No active workspace was found for this AI request. Refresh the page and try again."
    }
    if (/openrouter|gemini api key not configured|openai api key not configured|api key missing/i.test(normalized)) {
        return "Your AI provider is not configured yet. Update it in Settings -> AI Provider."
    }
    if (/API_KEY_INVALID|api key not valid/i.test(msg)) {
        return "Your AI API key is invalid or expired. Update it in Settings → AI Provider."
    }
    if (/RESOURCE_EXHAUSTED|quota/i.test(msg)) {
        return "AI API quota exceeded. Wait a moment or upgrade your API plan."
    }
    if (/rate limit|too many requests/i.test(normalized)) {
        return "The AI service is rate-limited right now. Please wait a moment and try again."
    }
    if (/timeout|timed out|network/i.test(normalized)) {
        return "The AI request took too long or lost connection. Please try again."
    }
    return normalized || "An unexpected AI error occurred."
}

// ─── Shared inner UI ─────────────────────────────────────────────────────────
interface InnerProps extends CreatePostModalProps {
    onClose: () => void
}

function PostCreatorInner({ open, onClose, postToEdit, workspaceId, initialCaption, initialMedia, initialDate }: InnerProps) {
    const router = useRouter()
    const { toast } = useToast()

    const [activeTab, setActiveTab] = useState('all')
    const [globalMedia, setGlobalMedia] = useState<string[]>([])
    const [globalCaption, setGlobalCaption] = useState('')
    const [scheduledAt, setScheduledAt] = useState<Date | undefined>()
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitAction, setSubmitAction] = useState<'draft' | 'scheduled' | 'published' | null>(null)
    const [isRefreshingHashtags, setIsRefreshingHashtags] = useState(false)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    const [inlineError, setInlineError] = useState<string | null>(null)
    const [suggestedHashtags, setSuggestedHashtags] = useState(SUGGESTED_HASHTAGS)
    const [intelligence, setIntelligence] = useState<PostIntelligenceResult | null>(null)
    const [isAnalyzingIntelligence, setIsAnalyzingIntelligence] = useState(false)

    useEffect(() => {
        if (open && !scheduledAt && !postToEdit && !initialDate) {
            const nextDate = new Date()
            queueMicrotask(() => setScheduledAt(nextDate))
        }
    }, [open, scheduledAt, postToEdit, initialDate])

    useEffect(() => {
        if (!open) return
        let cancelled = false

        queueMicrotask(() => {
            if (cancelled) return
            setInlineError(null)
            setIntelligence(null)

            if (postToEdit) {
                setGlobalCaption(postToEdit.content || '')
                setGlobalMedia(postToEdit.media_urls || [])
                if (postToEdit.scheduled_for) setScheduledAt(new Date(postToEdit.scheduled_for))
                return
            }

            if (initialCaption || (initialMedia && initialMedia.length > 0) || initialDate) {
                if (initialCaption) setGlobalCaption(initialCaption)
                if (initialMedia && initialMedia.length > 0) setGlobalMedia(initialMedia)
                if (initialDate) setScheduledAt(initialDate)
                return
            }

            if (typeof window !== 'undefined') {
                const draftMedia = sessionStorage.getItem('draft_post_media')
                if (draftMedia) {
                    try {
                        const parsed = JSON.parse(draftMedia)
                        if (Array.isArray(parsed) && parsed.length > 0) setGlobalMedia(parsed)
                    } catch { }
                    sessionStorage.removeItem('draft_post_media')
                }
                const draftCaption = sessionStorage.getItem('draft_post_caption')
                if (draftCaption) {
                    setGlobalCaption(draftCaption)
                    sessionStorage.removeItem('draft_post_caption')
                }
            }
        }
        )

        return () => {
            cancelled = true
        }
    }, [open, postToEdit, initialCaption, initialMedia, initialDate])

    const handleGenerateImage = async (prompt: string) => {
        setIsGeneratingAI(true)
        setInlineError(null)
        try {
            const res = await fetch('/api/assistant/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ functionName: 'generate-image', body: { prompt, workspaceId } }),
            })
            const payload = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(payload?.error || 'Failed to generate image')
            const data = payload?.data
            if (data?.error) throw new Error(data.error)
            if (data?.result?.imageUrl) setGlobalMedia(p => [...p, data.result.imageUrl])
        } catch (e) {
            setInlineError(sanitizeAIError(e instanceof Error ? e.message : 'Failed to generate image.'))
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleGenerateCaption = async () => {
        setIsGeneratingAI(true)
        setInlineError(null)
        try {
            let description = globalCaption
            if (!description.trim() && globalMedia.length > 0) {
                description = `Generate an engaging ${activeTab === 'all' ? 'social media' : activeTab} caption for a post with ${globalMedia.length} image(s).`
            } else if (!description.trim()) {
                description = 'Write an engaging caption for this post'
            }
            const res = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description, platforms: [activeTab === 'all' ? 'instagram' : activeTab], tone: 'engaging', language: 'en', workspaceId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to generate caption')
            if (data?.suggestions?.length > 0) {
                setGlobalCaption(data.suggestions[0])
                return
            }
            throw new Error(data?.error || 'The AI assistant could not generate a caption for this post.')
        } catch (e) {
            setInlineError(sanitizeAIError(e instanceof Error ? e.message : 'Failed to generate caption.'))
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleRefreshHashtags = async () => {
        setIsRefreshingHashtags(true)
        setInlineError(null)
        try {
            const res = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: 'Generate 10 relevant hashtags for: ' + globalCaption, platforms: ['instagram'], tone: 'engaging', workspaceId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to refresh hashtags')
            if (data?.suggestions && Array.isArray(data.suggestions)) {
                const tags = (data.suggestions.join(' ').match(/#[a-zA-Z0-9_]+/g) || []) as string[]
                if (tags.length > 0) {
                    setSuggestedHashtags(Array.from(new Set(tags)).slice(0, 8) as string[])
                    return
                }
            }
            throw new Error(data?.error || 'The AI assistant could not generate hashtags for this post.')
        } catch (e) {
            setInlineError(sanitizeAIError(e instanceof Error ? e.message : 'Failed to refresh hashtags.'))
        } finally {
            setIsRefreshingHashtags(false)
        }
    }

    const selectedPlatforms = () => (
        activeTab === 'all'
            ? ['instagram', 'facebook']
            : [activeTab === 'facebook' ? 'facebook' : 'instagram']
    )

    const handleAnalyzeIntelligence = async () => {
        setIsAnalyzingIntelligence(true)
        setInlineError(null)
        try {
            const res = await fetch('/api/content-intelligence/analyze-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caption: globalCaption,
                    platforms: selectedPlatforms(),
                    mediaUrls: globalMedia,
                    scheduledAt: scheduledAt?.toISOString() || null,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error || 'Failed to analyze post')
            setIntelligence(data as PostIntelligenceResult)
        } catch (error) {
            setInlineError(error instanceof Error ? error.message : 'Failed to analyze post.')
        } finally {
            setIsAnalyzingIntelligence(false)
        }
    }

    const handleApplyHashtag = (tag: string) => {
        setGlobalCaption((value) => value.includes(tag) ? value : `${value.trim()} ${tag}`.trim())
    }

    const handleApplySlot = (iso: string) => {
        const date = new Date(iso)
        if (Number.isFinite(date.getTime())) setScheduledAt(date)
    }

    const base64ToBlob = (base64: string): Blob => {
        const arr = base64.split(',')
        const mime = arr[0].match(/:(.*?);/)![1]
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        while (n--) u8arr[n] = bstr.charCodeAt(n)
        return new Blob([u8arr], { type: mime })
    }

    const handleSubmit = async (status: 'draft' | 'scheduled' | 'published') => {
        setIsSubmitting(true)
        setSubmitAction(status)
        setInlineError(null)
        try {
            // Data URLs (AI-generated previews) are uploaded via the server
            // route so the objects are workspace-scoped and tracked for
            // quotas/retention cleanup.
            const processedMedia = await Promise.all(globalMedia.map(async (url) => {
                if (!url.startsWith('data:')) return url
                const blob = base64ToBlob(url)
                const fileExt = url.split(';')[0].split('/')[1] || 'png'
                const formData = new FormData()
                formData.append('file', new File([blob], `ai-gen.${fileExt}`, { type: blob.type }))
                formData.append('kind', 'generated')

                const response = await fetch('/api/media/upload', { method: 'POST', body: formData })
                const payload = await response.json().catch(() => null)
                if (!response.ok || !payload?.url) {
                    throw new Error(payload?.error || 'Failed to upload generated image')
                }
                return payload.url as string
            }))

            let selectedPlatforms = ['instagram', 'facebook']
            if (activeTab === 'instagram') selectedPlatforms = ['instagram']
            if (activeTab === 'facebook') selectedPlatforms = ['facebook']

            const res = await fetch('/api/posts', {
                method: postToEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platforms: selectedPlatforms,
                    captionByPlatform: { instagram: globalCaption, facebook: globalCaption },
                    mediaUrls: processedMedia,
                    status,
                    scheduledAt: scheduledAt?.toISOString(),
                    id: postToEdit?.id,
                }),
            })

            let responseData: { error?: string } | null = null
            try { responseData = await res.json() } catch { }
            if (!res.ok) throw new Error(responseData?.error || `Request failed (${res.status})`)

            onClose()
            router.refresh()
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Failed to create post'
            setInlineError(message)
            toast({ title: 'Post action failed', description: message, variant: 'destructive' })
        } finally {
            setIsSubmitting(false)
            setSubmitAction(null)
        }
    }

    // Validation
    const IG_CAPTION_LIMIT = 2200
    const IG_HASHTAG_LIMIT = 5
    const hasContent = globalCaption.length > 0 || globalMedia.length > 0
    const instagramSelected = activeTab === 'instagram' || activeTab === 'all'
    const instagramNeedsMedia = instagramSelected && globalMedia.length === 0
    const charCount = globalCaption.length
    const hashtagCount = (globalCaption.match(/#[a-zA-Z0-9_]+/g) || []).length
    const captionOverLimit = instagramSelected && charCount > IG_CAPTION_LIMIT
    const hashtagsOverLimit = instagramSelected && hashtagCount > IG_HASHTAG_LIMIT
    const isValid = hasContent
    const canPublish = isValid && !instagramNeedsMedia && !captionOverLimit && !hashtagsOverLimit

    return (
        <div className="relative flex flex-col h-full min-h-0">
            {/* Loading overlay */}
            {isSubmitting && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px] rounded-inherit">
                    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1b1d28]/95 px-4 py-3 shadow-lg">
                        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                        <div className="text-sm">
                            <p className="font-medium text-white/90">
                                {submitAction === 'draft' ? 'Saving draft…'
                                    : submitAction === 'scheduled' ? (postToEdit?.status === 'scheduled' ? 'Saving changes…' : 'Scheduling post…')
                                        : 'Publishing post…'}
                            </p>
                            <p className="text-xs text-white/50">Please wait and do not close this panel.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Header ── */}
            <div className="shrink-0 border-b border-white/10 bg-[#1b1d28]/75 px-5 pb-3 pt-2">
                {/* Drag handle – visible only on small screens */}
                <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-white/20 sm:hidden" />
                <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-cyan-300" />
                    <h2 className="text-base font-medium text-white/90">
                        {postToEdit ? 'Edit Post' : 'Create Post'}
                    </h2>
                    <div className="ml-auto">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-3 sm:space-y-4 min-h-0">
                {inlineError && (
                    <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                        {inlineError}
                    </div>
                )}

                {/* Platform Tabs */}
                <div className="flex gap-1.5">
                    {PLATFORMS.map(({ id, label, icon: Icon, color }) => (
                        <button
                            key={id}
                            onClick={() => setActiveTab(id)}
                            className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs sm:text-sm transition-all',
                                activeTab === id
                                    ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600'
                                    : 'border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            )}
                        >
                            <Icon className={cn('h-3.5 w-3.5 shrink-0', color)} />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>

                {/* Caption editor */}
                <div className="border rounded-xl overflow-hidden">
                    <textarea
                        value={globalCaption}
                        onChange={e => setGlobalCaption(e.target.value)}
                        placeholder="What do you want to share?"
                        className="w-full p-3 min-h-[90px] sm:min-h-[120px] resize-none bg-transparent focus:outline-none text-sm"
                    />
                    <div className="flex items-center justify-between px-2 py-1.5 border-t bg-zinc-50 dark:bg-zinc-800/50">
                        <div className="flex items-center gap-0.5">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <button className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md" title="Add emoji">
                                        <Smile className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0 border-none shadow-none" align="start">
                                    <EmojiPicker
                                        onEmojiClick={e => setGlobalCaption(p => p + e.emoji)}
                                        theme={Theme.LIGHT}
                                        lazyLoadEmojis
                                        width={300}
                                        height={350}
                                        previewConfig={{ showPreview: false }}
                                        skinTonesDisabled
                                    />
                                </PopoverContent>
                            </Popover>
                            <button
                                onClick={handleGenerateCaption}
                                disabled={isGeneratingAI}
                                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md disabled:opacity-50"
                                title="AI caption"
                            >
                                <Wand2 className={cn('h-4 w-4 text-purple-500', isGeneratingAI && 'animate-spin')} />
                            </button>
                        </div>
                        <div className="flex items-center gap-2">
                            {instagramSelected && hashtagCount > 0 && (
                                <span className={cn('text-xs', hashtagsOverLimit ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                                    #{hashtagCount}/{IG_HASHTAG_LIMIT}
                                </span>
                            )}
                            <span className={cn('text-xs', captionOverLimit ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                                {charCount}{instagramSelected ? `/${IG_CAPTION_LIMIT}` : ''}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Content Intelligence */}
                <ContentIntelligenceSummary
                    result={intelligence}
                    loading={isAnalyzingIntelligence}
                    onAnalyze={handleAnalyzeIntelligence}
                />
                <ContentIntelligencePanel
                    result={intelligence}
                    loading={isAnalyzingIntelligence}
                    onAnalyze={handleAnalyzeIntelligence}
                    onApplyHashtag={handleApplyHashtag}
                    onApplySlot={handleApplySlot}
                />

                {/* Hashtags */}
                <div>
                    <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Hashtags</span>
                        <button
                            onClick={handleRefreshHashtags}
                            disabled={isRefreshingHashtags || isGeneratingAI}
                            className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                        >
                            <RefreshCw className={cn('h-3 w-3 text-muted-foreground', isRefreshingHashtags && 'animate-spin')} />
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestedHashtags.map(tag => (
                            <button
                                key={tag}
                                onClick={() => setGlobalCaption(p => p + ' ' + tag)}
                                className="px-2.5 py-1 text-[11px] bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                            >
                                {tag}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Media upload */}
                <MediaUploadZone
                    mediaUrls={globalMedia}
                    onMediaChange={setGlobalMedia}
                    onAiGenerate={handleGenerateImage}
                    isGenerating={isGeneratingAI}
                />
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 border-t border-white/10 bg-[#1b1d28]/60 px-3 sm:px-4 py-3 space-y-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                {/* Scheduling */}
                <SchedulingControls
                    scheduledAt={scheduledAt}
                    onChange={setScheduledAt}
                    caption={globalCaption}
                    platforms={selectedPlatforms()}
                />

                {/* Validation warnings */}
                {instagramNeedsMedia && (
                    <p className="text-xs text-amber-500 flex items-center gap-1.5">
                        <Info className="h-3 w-3 shrink-0" />
                        Instagram needs at least one image to publish or schedule.
                    </p>
                )}
                {captionOverLimit && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                        <Info className="h-3 w-3 shrink-0" />
                        Caption is {charCount - IG_CAPTION_LIMIT} chars over limit.
                    </p>
                )}
                {hashtagsOverLimit && (
                    <p className="text-xs text-red-500 flex items-center gap-1.5">
                        <Info className="h-3 w-3 shrink-0" />
                        {hashtagCount}/{IG_HASHTAG_LIMIT} hashtags — max {IG_HASHTAG_LIMIT} allowed.
                    </p>
                )}

                {/* Action buttons row */}
                <div className="flex gap-2 items-center">
                    <Button variant="ghost" onClick={onClose} disabled={isSubmitting} size="sm" className="text-xs shrink-0">
                        Cancel
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPreviewOpen(true)}
                        className="gap-1.5 text-xs shrink-0"
                        disabled={(globalMedia.length === 0 && !globalCaption) || isSubmitting}
                    >
                        <Eye className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Preview</span>
                    </Button>
                    {/* Save Draft – desktop only in this row */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSubmit('draft')}
                        disabled={!isValid || isSubmitting}
                        className="text-pink-500 border-pink-200 hover:bg-pink-50 text-xs shrink-0 hidden sm:flex"
                    >
                        {submitAction === 'draft' && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                        {submitAction === 'draft' ? 'Saving…' : 'Save Draft'}
                    </Button>
                    <div className="flex-1" />
                    <Button
                        size="sm"
                        onClick={() => handleSubmit('scheduled')}
                        disabled={!canPublish || isSubmitting}
                        className="bg-blue-500 hover:bg-blue-600 text-white gap-1.5 text-xs shrink-0"
                    >
                        {submitAction === 'scheduled' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {submitAction === 'scheduled'
                            ? (postToEdit?.status === 'scheduled' ? 'Saving…' : 'Scheduling…')
                            : (postToEdit?.status === 'scheduled' ? 'Save' : 'Schedule')}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => handleSubmit('published')}
                        disabled={!canPublish || isSubmitting}
                        className="bg-pink-500 hover:bg-pink-600 text-white gap-1.5 text-xs shrink-0"
                    >
                        {submitAction === 'published' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {submitAction === 'published' ? 'Posting…' : 'Post Now'}
                    </Button>
                </div>

                {/* Save Draft – mobile only, full width below the main row */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSubmit('draft')}
                    disabled={!isValid || isSubmitting}
                    className="w-full text-pink-500 border-pink-200/50 hover:bg-pink-50/10 text-xs sm:hidden"
                >
                    {submitAction === 'draft' && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
                    {submitAction === 'draft' ? 'Saving draft…' : 'Save as Draft'}
                </Button>
            </div>

            {/* Preview sub-dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent
                    showCloseButton={false}
                    className="w-[calc(100vw-1rem)] max-w-[430px] max-h-[94dvh] bg-transparent border-none shadow-none p-0 overflow-visible flex items-center justify-center"
                >
                    <DialogTitle className="sr-only">Instagram Post Preview</DialogTitle>
                    <DialogDescription className="sr-only">Preview your post</DialogDescription>
                    <div className="relative flex w-full justify-center px-2 py-4 sm:p-0">
                        <Button
                            variant="secondary"
                            size="icon"
                            className="absolute right-3 top-3 rounded-full h-8 w-8 z-50 shadow-md bg-white hover:bg-zinc-100 text-black border sm:-right-4 sm:-top-4"
                            onClick={() => setIsPreviewOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <InstagramPostPreview
                            caption={globalCaption || 'Write a caption to see it here...'}
                            mediaUrls={globalMedia}
                            username="instagram_user"
                            date={scheduledAt || new Date()}
                            className="shrink-0"
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}

// ─── Exported component ───────────────────────────────────────────────────────
function CreatePostLockedNotice({ onClose }: { onClose: () => void }) {
    return (
        <div className="flex h-full min-h-[280px] flex-col">
            <div className="shrink-0 border-b border-white/10 bg-[#1b1d28]/75 px-5 pb-3 pt-2">
                <div className="mx-auto mb-2 h-1 w-12 rounded-full bg-white/20 sm:hidden" />
                <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-amber-300" />
                    <h2 className="text-base font-medium text-white/90">Create Post</h2>
                    <div className="ml-auto">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 items-center justify-center p-6 sm:p-8">
                <div className="w-full max-w-md rounded-2xl border border-amber-300/20 bg-amber-400/5 p-5 text-center">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10">
                        <Lock className="h-5 w-5 text-amber-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-white/90">Read-only role</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                        Your current workspace role can view content but cannot create, schedule, or edit posts.
                    </p>
                    <div className="mt-4 flex justify-center">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}

export function CreatePostModal(props: CreatePostModalProps) {
    const { open, onOpenChange } = props
    const [isMobile, setIsMobile] = useState(false)
    const canWriteContent = useWorkspacePermission("content:write")

    useEffect(() => {
        if (typeof window === 'undefined') return
        const mq = window.matchMedia('(max-width: 639px)')
        const update = () => setIsMobile(mq.matches)
        update()
        mq.addEventListener('change', update)
        return () => mq.removeEventListener('change', update)
    }, [])

    const inner = canWriteContent
        ? <PostCreatorInner {...props} onClose={() => onOpenChange(false)} />
        : <CreatePostLockedNotice onClose={() => onOpenChange(false)} />

    // Mobile: slide-up bottom sheet via Radix Sheet (portal-based, real animation)
    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent
                    side="bottom"
                    className={cn(
                        '[&>button:last-child]:hidden', // hide default close btn
                        'p-0 gap-0 flex flex-col',
                        'bg-[#151620] text-white/85',
                        'border-t border-x border-white/10',
                        'rounded-t-3xl',
                        'h-[92dvh]',
                        'overflow-hidden',
                    )}
                >
                    <SheetTitle className="sr-only">Create Post</SheetTitle>
                    <SheetDescription className="sr-only">Create a new social media post.</SheetDescription>
                    {inner}
                </SheetContent>
            </Sheet>
        )
    }

    // Desktop: centered dialog
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className={cn(
                    'p-0 gap-0 flex flex-col',
                    'bg-[#151620] text-white/85',
                    'border border-white/10',
                    'rounded-2xl',
                    'w-full max-w-3xl',
                    'max-h-[92vh]',
                    'overflow-hidden',
                )}
            >
                <DialogTitle className="sr-only">Create Post</DialogTitle>
                <DialogDescription className="sr-only">Create a new social media post.</DialogDescription>
                {inner}
            </DialogContent>
        </Dialog>
    )
}
