"use client"

import { createClient } from "@/utils/supabase/client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Platform } from "@/types/post"
import { MediaUploadZone } from "./media-upload-zone"
import { SchedulingControls } from "./scheduling-controls"
import { X, Info, Plus, Instagram, Facebook, Monitor, Clock, Sparkles, RefreshCw, Smile, Bold, Italic, Link, BarChart2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface CreatePostModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const PLATFORMS = [
    { id: 'all', label: 'All', icon: Monitor },
    { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-500' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-500' },
]

const SUGGESTED_HASHTAGS = ['#OpenSourceLife', '#CodingCommunity', '#SkilledDeveloper', '#CareerGrowth']

export function CreatePostModal({ open, onOpenChange }: CreatePostModalProps) {
    // --- State ---
    const [activeTab, setActiveTab] = useState<string>('all')
    const [globalMedia, setGlobalMedia] = useState<string[]>([])
    const [globalCaption, setGlobalCaption] = useState('')
    const [scheduledAt, setScheduledAt] = useState<Date | undefined>(new Date())
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Check for draft data from Chat Interface when modal opens
    useEffect(() => {
        if (!open) return

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
            const supabase = createClient()
            const { data, error } = await supabase.functions.invoke('generate-image', {
                body: { prompt }
            })
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
            const supabase = createClient()
            const { data, error } = await supabase.functions.invoke('generate-ideas', {
                body: {
                    intent: 'Generate a social media caption',
                    topic: globalCaption || 'Create an engaging post',
                    platform: activeTab === 'all' ? 'instagram' : activeTab
                }
            })

            if (data?.result?.content_cards && data.result.content_cards.length > 0) {
                // Use the first generated idea as caption
                setGlobalCaption(data.result.content_cards[0].body)
            }
        } catch (e) {
            console.error("Caption Gen Error", e)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleRefreshHashtags = async () => {
        // In a real implementation, this would call an AI function to generate relevant hashtags
        // For now, we'll just rotate the existing ones
        const allHashtags = [
            '#OpenSourceLife', '#CodingCommunity', '#SkilledDeveloper', '#CareerGrowth',
            '#TechLife', '#DeveloperLife', '#CodeNewbie', '#Programming',
            '#WebDev', '#SoftwareEngineering', '#LearnToCode', '#DevCommunity'
        ]
        // Randomly select 4 hashtags
        const shuffled = allHashtags.sort(() => 0.5 - Math.random())
        // Update the suggested hashtags (you'd need to add state for this)
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

            const payload = {
                platforms: ['instagram', 'facebook'],
                captionByPlatform: { instagram: globalCaption, facebook: globalCaption },
                mediaUrls: processedMedia,
                status,
                scheduledAt: scheduledAt?.toISOString()
            }

            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error('Failed to save')

            onOpenChange(false)
        } catch (e) {
            console.error(e)
        } finally {
            setIsSubmitting(false)
        }
    }

    const removeMedia = (index: number) => {
        const newUrls = [...globalMedia]
        newUrls.splice(index, 1)
        setGlobalMedia(newUrls)
    }

    // --- Validation ---
    const hasContent = globalCaption.length > 0 || globalMedia.length > 0
    const isValid = hasContent
    const charCount = globalCaption.length

    // --- Render ---
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-900 max-h-[90vh] flex flex-col">
                <DialogTitle className="sr-only">Create Post</DialogTitle>
                <DialogDescription className="sr-only">Create a new social media post for your platforms.</DialogDescription>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b">
                    <div className="flex items-center gap-2">
                        <Plus className="h-4 w-4" />
                        <h2 className="text-base font-medium">Create Post</h2>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </div>
                    <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
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
                                <button className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-md"><Smile className="h-4 w-4 text-muted-foreground" /></button>
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
                            <span className="text-xs text-muted-foreground">{charCount}</span>
                        </div>
                    </div>

                    {/* Suggested Hashtags */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs text-muted-foreground uppercase tracking-wide">Suggested Hashtags</span>
                            <button
                                onClick={handleRefreshHashtags}
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                                title="Refresh hashtags"
                            >
                                <RefreshCw className="h-3 w-3 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {SUGGESTED_HASHTAGS.map((tag) => (
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
                    {globalMedia.length > 0 && (
                        <div className="relative w-fit">
                            <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 shadow-sm">
                                <img
                                    src={globalMedia[0]}
                                    alt="Preview"
                                    className="max-w-[280px] max-h-[280px] object-contain"
                                />
                            </div>
                            <button
                                onClick={() => removeMedia(0)}
                                className="absolute -top-2 -right-2 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-md"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    )}

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
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Sparkles className="h-3 w-3" />
                            Next slot
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Clock className="h-3 w-3" />
                            Timeslots
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1.5">
                            <Info className="h-3 w-3" />
                            Suggestions
                        </Button>
                    </div>

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
                                onClick={() => handleSubmit('draft')}
                                disabled={!isValid || isSubmitting}
                                className="text-pink-500 border-pink-200 hover:bg-pink-50"
                            >
                                Save as Draft
                            </Button>
                            <Button
                                onClick={() => handleSubmit('scheduled')}
                                disabled={!isValid || isSubmitting}
                                className="bg-blue-500 hover:bg-blue-600 text-white"
                            >
                                Schedule Post
                            </Button>
                            <Button
                                onClick={() => handleSubmit('published')}
                                disabled={!isValid || isSubmitting}
                                className="bg-pink-500 hover:bg-pink-600 text-white"
                            >
                                Post Now
                            </Button>
                        </div>
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    )
}
