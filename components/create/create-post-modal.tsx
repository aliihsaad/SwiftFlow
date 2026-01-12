"use client"

import { createClient } from "@/utils/supabase/client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Platform } from "@/types/post"
import { PlatformTabs } from "./platform-tabs"
import { PostContentEditor } from "./post-content-editor"
import { MediaUploadZone } from "./media-upload-zone"
import { AIAssistInput } from "./ai-assist-input"
import { AISuggestionsPanel } from "./ai-suggestions-panel"
import { SchedulingControls } from "./scheduling-controls"
// import { ModalFooterActions } from "./modal-footer-actions" // Integrated into footer
import { X, Info } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CreatePostModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function CreatePostModal({ open, onOpenChange }: CreatePostModalProps) {
    // --- State ---
    const [activeTab, setActiveTab] = useState<Platform | 'all'>('all')

    // Data State
    const [captionByPlatform, setCaptionByPlatform] = useState<{ instagram: string, facebook: string }>({
        instagram: '',
        facebook: ''
    })
    const [mediaByPlatform, setMediaByPlatform] = useState<{ instagram: string[], facebook: string[] }>({
        instagram: [],
        facebook: []
    }) // For v1, simplifying: Global media or per-platform override? 
    // Requirement says: "mediaByPlatform can default from 'All' and optionally be overridden."
    // Let's implement full overrides.
    const [globalMedia, setGlobalMedia] = useState<string[]>([])
    const [globalCaption, setGlobalCaption] = useState('')

    // Scheduling
    const [scheduledAt, setScheduledAt] = useState<Date | undefined>(new Date())

    // AI & UI State
    const [aiInput, setAiInput] = useState('')
    const [isGeneratingAI, setIsGeneratingAI] = useState(false)
    const [aiSuggestions, setAiSuggestions] = useState<string[]>([])
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Check for draft data from Chat Interface
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const draftMedia = sessionStorage.getItem('draft_post_media')
            if (draftMedia) {
                try {
                    const parsed = JSON.parse(draftMedia)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setGlobalMedia(prev => [...prev, ...parsed])
                        // Assuming new draft implies we want to start fresh or append? 
                        // Let's append to avoid overwriting existing uploads if any (though on fresh mount it's empty)
                    }
                } catch (e) {
                    console.error("Failed to parse draft media", e)
                }
                sessionStorage.removeItem('draft_post_media')
            }

            // Optional: Also capture caption context if available
            // const draftCaption = sessionStorage.getItem('draft_post_caption') 
            // if (draftCaption) ...
        }
    }, [])

    // --- Derived State (current view) ---

    const currentCaption = activeTab === 'all'
        ? globalCaption
        : (captionByPlatform[activeTab] || globalCaption) // Fallback to global if empty? Or simple copy logic?
    // Requirement: "Allow overriding caption/media for that platform while keeping a global default."
    // Let's adopt a "dirty" model: if user edits in tab, it sets the override.

    const currentMedia = activeTab === 'all'
        ? globalMedia
        : (mediaByPlatform[activeTab].length > 0 ? mediaByPlatform[activeTab] : globalMedia)

    // --- Handlers ---

    const handleTabChange = (tab: Platform | 'all') => {
        setActiveTab(tab)
    }

    const handleCaptionChange = (val: string) => {
        if (activeTab === 'all') {
            setGlobalCaption(val)
            // Clear overrides? Or just update global? 
            // Usually "All" updates everything unless specifically overridden? 
            // For simplicity/predictability: "All" updates global. 
            // The overrides only stick if user explicitly edits them.
            // But if user wants to reset, it's hard.
            // Let's say: "All" updates global. Platform view shows Global if Override is empty.
            // If user types in Platform view, it sets Override.
        } else {
            setCaptionByPlatform(prev => ({ ...prev, [activeTab]: val }))
        }
    }

    const handleMediaChange = (urls: string[]) => {
        if (activeTab === 'all') {
            setGlobalMedia(urls)
        } else {
            setMediaByPlatform(prev => ({ ...prev, [activeTab]: urls }))
        }
    }

    const handleGenerateAI = async () => {
        setIsGeneratingAI(true)
        setAiSuggestions([])
        try {
            const res = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                body: JSON.stringify({
                    description: aiInput,
                    platforms: activeTab === 'all' ? ['instagram', 'facebook'] : [activeTab]
                })
            })
            const data = await res.json()
            if (data.suggestions) {
                setAiSuggestions(data.suggestions)
            }
        } catch (e) {
            console.error(e)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleGenerateImage = async (prompt: string) => {
        setIsGeneratingAI(true)
        try {
            const supabase = createClient()
            const { data, error } = await supabase.functions.invoke('generate-image', {
                body: { prompt }
            })
            if (data?.result?.imageUrl) {
                // Add to Global Media
                setGlobalMedia(prev => [...prev, data.result.imageUrl])
            }
        } catch (e) {
            console.error("Image Gen Error", e)
        } finally {
            setIsGeneratingAI(false)
        }
    }

    const handleApplySuggestion = (suggestion: string) => {
        handleCaptionChange(suggestion)
        setAiSuggestions([]) // Hide after selection
    }

    const handleRewrite = async () => {
        // Quick "rewrite" logic - reusing generation but targeting specific text
        setIsGeneratingAI(true)
        try {
            // Re-use logic or separate endpoint. For MVP, reuse generation with specific prompt
            const res = await fetch('/api/ai/generate-caption', {
                method: 'POST',
                body: JSON.stringify({
                    description: `Rewrite this to be more engaging: ${currentCaption}`,
                    platforms: activeTab === 'all' ? ['instagram', 'facebook'] : [activeTab]
                })
            })
            const data = await res.json()
            if (data.suggestions && data.suggestions.length > 0) {
                handleCaptionChange(data.suggestions[0])
            }
        } catch (e) { console.error(e) }
        finally { setIsGeneratingAI(false) }
    }

    // Helper to convert Base64 to Blob
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
            // Process Media: Upload any Base64 images to Storage
            const processedMedia = await Promise.all(globalMedia.map(async (url) => {
                if (url.startsWith('data:')) {
                    // Upload Base64 image
                    const blob = base64ToBlob(url)
                    const fileExt = url.split(';')[0].split('/')[1]
                    const fileName = `ai-gen-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

                    const { error: uploadError } = await supabase.storage
                        .from('post_media')
                        .upload(fileName, blob)

                    if (uploadError) throw uploadError

                    const { data: { publicUrl } } = supabase.storage
                        .from('post_media')
                        .getPublicUrl(fileName)

                    return publicUrl
                }
                return url // Return existing URL if not base64
            }))

            // Prepare payload
            // We need to resolve the final "truth" for each platform
            const platformsToCheck: Platform[] = ['instagram', 'facebook']

            // Resolve captions/media for each supported platform
            const finalCaptions = {
                instagram: captionByPlatform.instagram || globalCaption,
                facebook: captionByPlatform.facebook || globalCaption
            }

            // For MVP structure defined so far:
            const payload = {
                platforms: platformsToCheck,
                captionByPlatform: finalCaptions,
                mediaUrls: processedMedia, // Use processed URLs
                status,
                scheduledAt: scheduledAt?.toISOString()
            }

            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) throw new Error('Failed to save')

            onOpenChange(false) // Close modal on success
            // Should trigger refresh of list
        } catch (e) {
            console.error(e)
        } finally {
            setIsSubmitting(false)
        }
    }

    // --- Validation ---
    const hasContent = globalCaption.length > 0 || globalMedia.length > 0
    const isValid = hasContent // Simplified validation for now

    // --- Render ---
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden bg-background">
                <DialogTitle className="sr-only">Create Post</DialogTitle>
                <DialogDescription className="sr-only">Create a new social media post for your platforms.</DialogDescription>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/5">
                    <div className="flex items-center gap-2">
                        <button onClick={() => onOpenChange(false)} className="md:hidden mr-2">
                            <X className="h-5 w-5" />
                        </button>
                        <h2 className="text-lg font-semibold tracking-tight">Create Post</h2>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </div>

                    {/* Centered Tabs (Desktop) could go here or below */}

                    <button onClick={() => onOpenChange(false)} className="hidden md:block text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Main Content */}
                <div className="flex flex-col overflow-y-auto max-h-[80vh] bg-background">

                    {/* Tabs Bar */}
                    <div className="px-6 py-4">
                        <PlatformTabs
                            activeTab={activeTab}
                            onTabChange={handleTabChange}
                            platforms={{ instagram: true, facebook: true }}
                        />
                    </div>

                    {/* Editor & Media */}
                    <div className="px-6 pb-6 space-y-6">
                        <PostContentEditor
                            content={currentCaption}
                            activeTab={activeTab}
                            onChange={handleCaptionChange}
                            onRewrite={handleRewrite}
                            isRewriting={isGeneratingAI}
                        />

                        {/* Media Zone acts as both File Drop and AI Image Gen */}
                        <MediaUploadZone
                            mediaUrls={currentMedia}
                            onMediaChange={handleMediaChange}
                            onAiGenerate={(prompt) => {
                                setAiInput(prompt)
                                handleGenerateAI() // Reusing logic but need adapt for IMAGE vs CAPTION. 
                                // Wait, the right box in reference is "Describe image".
                                // My handleGenerateAI generated captions. 
                                // I should add IMAGE generation logic here if prompt is passed.
                                // For now, let's trigger caption suggestions OR image gen? 
                                // Reference says "Describe or drag... image". So it's Image Gen.
                                // Let's call a new handleGenerateImage(prompt)
                                handleGenerateImage(prompt)
                            }}
                            isGenerating={isGeneratingAI}
                        />
                    </div>
                </div>

                {/* Footer Bar (Date Picker + Actions) */}
                <div className="bg-background border-t p-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky bottom-0 z-10">

                    {/* Left: Scheduling View */}
                    <div className="flex items-center gap-3 w-full md:w-auto">
                        <span className="text-sm font-medium text-muted-foreground hidden md:inline">Pick a Date & Time:</span>
                        <SchedulingControls
                            scheduledAt={scheduledAt}
                            onChange={(d) => setScheduledAt(d)}
                        />
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button variant="outline" onClick={() => handleSubmit('draft')} disabled={!isValid || isSubmitting}>
                            Save as Draft
                        </Button>

                        {scheduledAt ? (
                            <Button
                                onClick={() => handleSubmit('scheduled')}
                                disabled={!isValid || isSubmitting}
                                className="bg-muted-foreground/20 text-foreground hover:bg-muted-foreground/30"
                            >
                                Schedule Post
                            </Button>
                        ) : (
                            <Button
                                onClick={() => handleSubmit('published')}
                                disabled={!isValid || isSubmitting}
                                className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                            >
                                Post Now
                            </Button>
                        )}
                    </div>
                </div>

            </DialogContent>
        </Dialog>
    )
}
