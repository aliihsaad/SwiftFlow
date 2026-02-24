"use client"

import { createClient } from "@/utils/supabase/client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Platform } from "@/types/post"
import { MediaUploadZone } from "./media-upload-zone"
import { SchedulingControls } from "./scheduling-controls"
import { InstagramPostPreview } from "./instagram-post-preview"
import { X, Info, Plus, Instagram, Facebook, Monitor, Clock, Sparkles, RefreshCw, Smile, Bold, Italic, Link, BarChart2, Wand2, Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import EmojiPicker, { Theme } from "emoji-picker-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface CreatePostModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    postToEdit?: any
    workspaceId: string
    initialCaption?: string
    initialMedia?: string[]
    initialDate?: Date
}

const PLATFORMS = [
    { id: 'all', label: 'All', icon: Monitor },
    { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
]

const SUGGESTED_HASHTAGS = ['#OpenSourceLife', '#CodingCommunity', '#SkilledDeveloper', '#CareerGrowth']

export function CreatePostModal({ open, onOpenChange, postToEdit, workspaceId, initialCaption, initialMedia, initialDate }: CreatePostModalProps) {
    // --- State ---
    const router = useRouter()
    const { toast } = useToast()
    const [activeTab, setActiveTab] = useState<string>('all')
    const [globalMedia, setGlobalMedia] = useState<string[]>([])
    const [globalCaption, setGlobalCaption] = useState('')
    const [scheduledAt, setScheduledAt] = useState<Date | undefined>(undefined)
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitAction, setSubmitAction] = useState<'draft' | 'scheduled' | 'published' | null>(null)
    const [isRefreshingHashtags, setIsRefreshingHashtags] = useState(false)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)

    // Initialize scheduledAt client-side to avoid hydration mismatch
    useEffect(() => {
        if (open && !scheduledAt && !postToEdit && !initialDate) {
            setScheduledAt(new Date())
        }
    }, [open, scheduledAt, postToEdit, initialDate])

    // Check for props, draft data, or edit mode when modal opens
    useEffect(() => {
        if (!open) return

        if (postToEdit) {
            setGlobalCaption(postToEdit.content || '')
            setGlobalMedia(postToEdit.media_urls || [])
            if (postToEdit.scheduled_for) {
                setScheduledAt(new Date(postToEdit.scheduled_for))
            }
            return // Skip other loading sources if editing
        }

        // Check for props first (from assistant modal trigger or calendar)
        if (initialCaption || (initialMedia && initialMedia.length > 0) || initialDate) {
            if (initialCaption) setGlobalCaption(initialCaption)
            if (initialMedia && initialMedia.length > 0) setGlobalMedia(initialMedia)
            if (initialDate) setScheduledAt(initialDate)
            return // Skip session storage if we have props
        }

        if (typeof window !== 'undefined') {
            const draftMedia = sessionStorage.getItem('draft_post_media')
            if (draftMedia) {
                try {
                    const parsed = JSON.parse(draftMedia)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        console.log("Loaded draft media:", parsed)
                        setGlobalMedia(parsed)
                    }
                } catch (e) {
                    console.error("Failed to parse draft media", e)
                }
                sessionStorage.removeItem('draft_post_media')
            }

            const draftCaption = sessionStorage.getItem('draft_post_caption')
            if (draftCaption) {
                console.log("Loaded draft caption:", draftCaption.substring(0, 50))
                setGlobalCaption(draftCaption)
                sessionStorage.removeItem('draft_post_caption')
            }
        }
    }, [open])

    // --- Handlers ---
    const handleCaptionChange = (val: string) => {
        setGlobalCaption(val)
    }

    const handleMediaChange = (urls: string[]) => {
        setGlobalMedia(urls)
    }

    const handleGenerateImage = async (prompt: string) => {
        setIsGeneratingAI(true)
        try {
            const response = await fetch('/api/assistant/invoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    functionName: 'generate-image',
                    body: {
                        prompt,
                        workspaceId
                    }
                })
            })

            const payload = await response.json().catch(() => ({}))
            if (!response.ok) {
                throw new Error(payload?.error || 'Failed to generate image')
            }

            const data = payload?.data
            if (data?.error) {
                throw new Error(data.error)
            }

            if (data?.result?.imageUrl) {
                setGlobalMedia(prev => [...prev, data.result.imageUrl])
            }
        } catch (e) {
            console.error("Image Gen Error", e)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleGenerateCaption = async () => {
        setIsGeneratingAI(true)
        try {
            // Build a better description based on available context
            let description = globalCaption

            // If no caption but we have media, provide context about the images
            if (!description.trim() && globalMedia.length > 0) {
                const imageCount = globalMedia.length
                description = `Generate an engaging ${activeTab === 'all' ? 'social media' : activeTab} caption for a post with ${imageCount} ${imageCount === 1 ? 'image' : 'images'}. Make it creative, engaging, and suitable for the platform.`
            } else if (!description.trim()) {
                description = 'Write an engaging caption for this post'
            }


            const response = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description,
                    platforms: [activeTab === 'all' ? 'instagram' : activeTab],
                    tone: 'engaging',
                    language: 'en',
                    workspaceId
                })
            })
            const data = await response.json().catch(() => ({}))

            console.log('Caption generation response:', { data, workspaceId })

            if (data?.suggestions && data.suggestions.length > 0) {
                // Replace with the first suggestion
                setGlobalCaption(data.suggestions[0])
            } else if (data?.error) {
                console.error('Caption generation error from API:', data.error)
            }
        } catch (e) {
            console.error("Caption Gen Error", e)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const [suggestedHashtags, setSuggestedHashtags] = useState(SUGGESTED_HASHTAGS)

    const handleRefreshHashtags = async () => {
        // Generate relevant hashtags using AI
        setIsRefreshingHashtags(true)
        try {
            const response = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: "Generate 10 relevant hashtags for: " + globalCaption,
                    platforms: ['instagram'],
                    tone: 'engaging',
                    workspaceId
                })
            })
            const data = await response.json().catch(() => ({}))

            if (data?.suggestions && Array.isArray(data.suggestions)) {
                // Extract hashtags from the response ideas
                // Since generate-caption returns strings, we'll look for #tags in them
                const combined = data.suggestions.join(' ')
                const tags = combined.match(/#[a-zA-Z0-9_]+/g) || []
                if (tags.length > 0) {
                    const uniqueTags = (Array.from(new Set(tags)) as string[]).slice(0, 8)
                    setSuggestedHashtags(uniqueTags)
                }
            }
        } catch (e) {
            console.error("Hashtag Gen Error", e)
        } finally {
            setIsRefreshingHashtags(false)
        }
    }

    const handleAddHashtag = (tag: string) => {
        setGlobalCaption(prev => prev + ' ' + tag)
    }

    const base64ToBlob = (base64: string): Blob => {
        const arr = base64.split(',')
        const mime = arr[0].match(/:(.*?);/)![1]
        const bstr = atob(arr[1])
        let n = bstr.length
        const u8arr = new Uint8Array(n)
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n)
        }
        return new Blob([u8arr], { type: mime })
    }

    const handleSubmit = async (status: 'draft' | 'scheduled' | 'published') => {
        setIsSubmitting(true)
        setSubmitAction(status)
        const supabase = createClient()

        try {
            const processedMedia = await Promise.all(globalMedia.map(async (url) => {
                if (url.startsWith('data:')) {
                    const blob = base64ToBlob(url)
                    const fileExt = url.split(';')[0].split('/')[1]
                    const fileName = `ai-gen-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

                    const { error: uploadError } = await supabase.storage
                        .from('generated_assets')
                        .upload(fileName, blob)

                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from('generated_assets')
                        .getPublicUrl(fileName)

                    return publicUrl
                }
                return url
            }))

            // Determine selected platforms
            let selectedPlatforms = ['instagram', 'facebook']
            if (activeTab === 'instagram') selectedPlatforms = ['instagram']
            if (activeTab === 'facebook') selectedPlatforms = ['facebook']

            const payload = {
                platforms: selectedPlatforms,
                captionByPlatform: { instagram: globalCaption, facebook: globalCaption },
                mediaUrls: processedMedia,
                status,
                scheduledAt: scheduledAt?.toISOString(),
                id: postToEdit?.id // Include ID for updates
            }

            const url = '/api/posts'
            const method = postToEdit ? 'PUT' : 'POST'

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            let responseData: any = null
            try {
                responseData = await res.json()
            } catch {
                // Response may not be JSON (e.g. timeout)
            }
            console.log('[CREATE_POST] API response:', res.status, responseData)

            if (!res.ok) throw new Error(responseData?.error || `Request failed (${res.status})`)

            onOpenChange(false)
            router.refresh()
        } catch (e: any) {
            console.error('[CREATE_POST] Error:', e)
            toast({
                title: "Post action failed",
                description: e.message || 'Failed to create post',
                variant: "destructive",
            })
        } finally {
            setIsSubmitting(false)
            setSubmitAction(null)
        }
    }

    const removeMedia = (index: number) => {
        const newUrls = [...globalMedia]
        newUrls.splice(index, 1)
        setGlobalMedia(newUrls)
    }

    // --- Instagram limits ---
    const IG_CAPTION_LIMIT = 2200
    const IG_HASHTAG_LIMIT = 5

    // --- Validation ---
    const hasContent = globalCaption.length > 0 || globalMedia.length > 0
    const instagramSelected = activeTab === 'instagram' || activeTab === 'all'
    const instagramNeedsMedia = instagramSelected && globalMedia.length === 0
    const charCount = globalCaption.length
    const hashtagCount = (globalCaption.match(/#[a-zA-Z0-9_]+/g) || []).length
    const captionOverLimit = instagramSelected && charCount > IG_CAPTION_LIMIT
    const hashtagsOverLimit = instagramSelected && hashtagCount > IG_HASHTAG_LIMIT
    const isValid = hasContent
    const canPublish = isValid && !instagramNeedsMedia && !captionOverLimit && !hashtagsOverLimit

    // --- Render ---
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 max-h-[90vh] flex flex-col">
                <DialogTitle className="sr-only">Create Post</DialogTitle>
                <DialogDescription className="sr-only">Create a new social media post for your platforms.</DialogDescription>

                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3 border-b">
                    <Plus className="h-4 w-4" />
                    <h2 className="text-base font-medium">Create Post</h2>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">

                    {/* Platform Tabs */}
                    <div className="flex gap-2">
                        {PLATFORMS.map((p) => {
                            const Icon = p.icon
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => setActiveTab(p.id)}
                                    className={cn(
                                        "flex items-center gap-2 px-4 py-2 rounded-lg border text-sm transition-all",
                                        activeTab === p.id
                                            ? "bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600"
                                            : "border-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800"
                                    )}
                                >
                                    <Icon className={cn("h-4 w-4", p.color)} />
                                    <span>{p.label}</span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Content Editor */}
                    <div className="border rounded-xl overflow-hidden">
                        <textarea
                            value={globalCaption}
                            onChange={(e) => handleCaptionChange(e.target.value)}
                            placeholder="What do you want to share?"
                            className="w-full p-4 min-h-[120px] resize-none bg-transparent focus:outline-none text-sm"
                        />
                        {/* Toolbar */}
                        <div className="flex items-center justify-between px-3 py-2 border-t bg-zinc-50 dark:bg-zinc-800/50">
                            <div className="flex items-center gap-1">
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md" title="Add emoji">
                                            <Smile className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-full p-0 border-none shadow-none" align="start">
                                        <EmojiPicker
                                            onEmojiClick={(emojiData) => handleCaptionChange(globalCaption + emojiData.emoji)}
                                            theme={Theme.LIGHT}
                                            lazyLoadEmojis={true}
                                            width={350}
                                            height={400}
                                            previewConfig={{ showPreview: false }}
                                            skinTonesDisabled
                                            searchDisabled={false}
                                        />
                                    </PopoverContent>
                                </Popover>
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"><Bold className="h-4 w-4 text-muted-foreground" /></button>
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"><Italic className="h-4 w-4 text-muted-foreground" /></button>
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"><Link className="h-4 w-4 text-muted-foreground" /></button>
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"><BarChart2 className="h-4 w-4 text-muted-foreground" /></button>
                                <button
                                    onClick={handleGenerateCaption}
                                    disabled={isGeneratingAI}
                                    className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md disabled:opacity-50"
                                    title="Generate caption with AI"
                                >
                                    <Wand2 className={cn("h-4 w-4 text-purple-500", isGeneratingAI && "animate-spin")} />
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                {instagramSelected && hashtagCount > 0 && (
                                    <span className={cn("text-xs", hashtagsOverLimit ? "text-red-500 font-medium" : "text-muted-foreground")}>
                                        #{hashtagCount}/{IG_HASHTAG_LIMIT}
                                    </span>
                                )}
                                <span className={cn("text-xs", captionOverLimit ? "text-red-500 font-medium" : "text-muted-foreground")}>
                                    {charCount}{instagramSelected ? `/${IG_CAPTION_LIMIT}` : ''}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Suggested Hashtags */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Suggested Hashtags</span>
                            <button
                                onClick={handleRefreshHashtags}
                                disabled={isRefreshingHashtags || isGeneratingAI}
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                                title="Refresh hashtags"
                            >
                                <RefreshCw className={cn("h-3 w-3 text-muted-foreground", isRefreshingHashtags && "animate-spin")} />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {suggestedHashtags.map((tag: string) => (
                                <button
                                    key={tag}
                                    onClick={() => handleAddHashtag(tag)}
                                    className="px-3 py-1.5 text-xs bg-zinc-100 dark:bg-zinc-800 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                >
                                    {tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Media Upload Zone (Two Column) */}
                    <MediaUploadZone
                        mediaUrls={globalMedia}
                        onMediaChange={handleMediaChange}
                        onAiGenerate={handleGenerateImage}
                        isGenerating={isGeneratingAI}
                    />

                    {/* Image Preview (Below Drop Zones) */}


                </div>

                {/* Footer */}
                <div className="border-t p-4 space-y-3">
                    {/* Date & Time Row */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-muted-foreground">Pick a Date & Time:</span>
                        <SchedulingControls
                            scheduledAt={scheduledAt}
                            onChange={(d) => setScheduledAt(d)}
                        />
                    </div>

                    {/* Instagram validation warnings */}
                    {instagramNeedsMedia && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            Instagram requires at least one image to publish. Add media to schedule or post.
                        </p>
                    )}
                    {captionOverLimit && (
                        <p className="text-xs text-red-500 flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            Caption exceeds Instagram's {IG_CAPTION_LIMIT} character limit by {charCount - IG_CAPTION_LIMIT} characters.
                        </p>
                    )}
                    {hashtagsOverLimit && (
                        <p className="text-xs text-red-500 flex items-center gap-1.5">
                            <Info className="h-3.5 w-3.5 shrink-0" />
                            Instagram allows a maximum of {IG_HASHTAG_LIMIT} hashtags per post. You have {hashtagCount}.
                        </p>
                    )}

                    {/* Actions Row */}
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" className="gap-1.5">
                            <Info className="h-3 w-3" />
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                                Cancel
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setIsPreviewOpen(true)}
                                className="gap-2"
                                disabled={(globalMedia.length === 0 && !globalCaption) || isSubmitting}
                            >
                                <Eye className="h-4 w-4" />
                                Preview
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => handleSubmit('draft')}
                                disabled={!isValid || isSubmitting}
                                className="text-pink-500 border-pink-200 hover:bg-pink-50"
                            >
                                {submitAction === 'draft' && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {submitAction === 'draft' ? 'Saving...' : 'Save as Draft'}
                            </Button>
                            <Button
                                onClick={() => handleSubmit('scheduled')}
                                disabled={!canPublish || isSubmitting}
                                className="bg-blue-500 hover:bg-blue-600 text-white gap-2"
                            >
                                {submitAction === 'scheduled' && <Loader2 className="h-4 w-4 animate-spin" />}
                                {submitAction === 'scheduled'
                                    ? (postToEdit && postToEdit.status === 'scheduled' ? 'Saving...' : 'Scheduling...')
                                    : (postToEdit && postToEdit.status === 'scheduled' ? 'Save Changes' : 'Schedule Post')}
                            </Button>
                            <Button
                                onClick={() => handleSubmit('published')}
                                disabled={!canPublish || isSubmitting}
                                className="bg-pink-500 hover:bg-pink-600 text-white gap-2"
                            >
                                {submitAction === 'published' && <Loader2 className="h-4 w-4 animate-spin" />}
                                {submitAction === 'published' ? 'Posting...' : 'Post Now'}
                            </Button>
                        </div>
                    </div>
                </div>

            </DialogContent>

            {/* Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent showCloseButton={false} className="max-w-md bg-transparent border-none shadow-none p-0 overflow-visible flex items-center justify-center">
                    <DialogTitle className="sr-only">Instagram Post Preview</DialogTitle>
                    <DialogDescription className="sr-only">Preview of how your post will appear on Instagram</DialogDescription>
                    <div className="relative w-full">
                        <Button
                            variant="secondary"
                            size="icon"
                            className="absolute -right-4 -top-4 rounded-full h-8 w-8 z-50 shadow-md bg-white hover:bg-zinc-100 text-black border"
                            onClick={() => setIsPreviewOpen(false)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                        <InstagramPostPreview
                            caption={globalCaption || "Write a caption to see it here..."}
                            mediaUrls={globalMedia}
                            username="instagram_user"
                            date={scheduledAt || new Date()}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </Dialog>
    )
}
