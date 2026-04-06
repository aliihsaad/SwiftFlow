"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Card } from "@/components/ui/card"
import {
    Bot,
    Send,
    User,
    Lightbulb,
    Images,
    Link as LinkIcon,
    Image as ImageIcon,
    Paintbrush,
    CalendarDays,
    BarChart3,
    ArrowUp,
    Copy,
    RefreshCw,
    History,
    Trash2,
    Paperclip,
    X
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { ContentCard } from "./components/content-card"
import { CarouselPreview } from "./components/carousel-preview"
import { ImagePreview } from "./components/image-preview"
import { StyleSelector } from "./components/style-selector"
import { CarouselStyleSelector } from "./components/carousel-style-selector"
import { IdeaOptionsSelector } from "./components/idea-options-selector"
import { BrandImageModeSelector, BrandImageOptions } from "./components/brand-image-options"
import { CreatePostModal } from "@/components/create/create-post-modal"

interface MessageImage {
    base64: string
    mimeType: string
    name: string
}

interface Message {
    role: 'user' | 'assistant'
    content: string
    type?: 'text' | 'content_cards' | 'carousel_slides' | 'image' | 'style_selector' | 'carousel_style_selector' | 'idea_options_selector' | 'brand_image_mode_selector' | 'brand_image_options'
    data?: any
    images?: MessageImage[]
}

interface ChatInterfaceProps {
    workspaceId?: string
}

function sanitizeAssistantImageError(msg: string): string {
    const normalized = msg.trim()
    if (/provider returned error|No endpoints found for|model not found|not available/i.test(normalized)) {
        return "The selected image model is unavailable right now. Try again in a moment or switch the image model in Settings -> AI Provider."
    }
    if (/quota|rate limit|too many requests/i.test(normalized)) {
        return "Your AI image provider is rate-limited or out of quota right now. Try again shortly."
    }
    if (/api key|unauthorized|forbidden|permission/i.test(normalized)) {
        return "Your AI image provider credentials need attention. Check Settings -> AI Provider."
    }
    return normalized || "Image generation failed. Please try again."
}

const ACTION_CARDS = [
    {
        icon: Lightbulb,
        title: "Generate content ideas",
        description: "Get creative post ideas for any platform",
        prompt: "Generate 5 content ideas for Instagram.",
        functionName: "generate-ideas"
    },
    {
        icon: Images,
        title: "Create a carousel",
        description: "Multi-image posts for Instagram or TikTok",
        prompt: "Create a 5-slide educational carousel about...",
        functionName: "generate-carousel"
    },
    {
        icon: ImageIcon,
        title: "Create an image",
        description: "Generate AI images for posts",
        prompt: "Create a realistic image of...",
        functionName: "generate-image"
    },
    {
        icon: Paintbrush,
        title: "Brand images",
        description: "Generate or transform images for your brand",
        prompt: "",
        functionName: "brand-images"
    }
]

const ASSIST_THEME = {
    shell: '#151620',
    shellAlt: '#1b1d28',
    bubble: '#1b1d28',
    border: 'rgba(255,255,255,0.08)',
    borderSoft: 'rgba(255,255,255,0.06)',
    text: 'rgba(255,255,255,0.85)',
    textMuted: 'rgba(255,255,255,0.5)',
    textDim: 'rgba(255,255,255,0.35)',
    cyan: '#38bdf8',
    cyanSoft: '#dff6ff',
    coral: '#fb7185',
    amber: '#fbbf24',
}

export function ChatInterface({ workspaceId }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [activeFunction, setActiveFunction] = useState<string>("chat-assistant")

    // History State
    const [sessions, setSessions] = useState<{ id: string, title: string }[]>([])
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [loadingSessions, setLoadingSessions] = useState(false)

    // Image attachment state
    const [pendingImages, setPendingImages] = useState<MessageImage[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { toast } = useToast()
    const scrollRef = useRef<HTMLDivElement>(null)

    const invokeEdge = async (functionName: string, body: Record<string, unknown>) => {
        const response = await fetch('/api/assistant/invoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ functionName, body })
        })

        let payload: any = null
        try {
            payload = await response.json()
        } catch {
            payload = null
        }

        if (response.status === 401) {
            throw new Error("Session expired or invalid. Please log in again.")
        }

        if (!response.ok) {
            throw new Error(payload?.error || `Failed to invoke ${functionName}`)
        }

        return payload?.data
    }

    // Image compression — resize to max 800px wide, 70% JPEG quality
    const compressImage = (file: File, maxWidth = 800, quality = 0.7): Promise<MessageImage> => {
        return new Promise((resolve, reject) => {
            const img = new window.Image()
            img.onload = () => {
                const canvas = document.createElement('canvas')
                const ratio = Math.min(maxWidth / img.width, 1)
                canvas.width = img.width * ratio
                canvas.height = img.height * ratio
                const ctx = canvas.getContext('2d')
                if (!ctx) { reject(new Error('Canvas not supported')); return }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                const base64 = canvas.toDataURL('image/jpeg', quality).split(',')[1]
                URL.revokeObjectURL(img.src)
                resolve({ base64, mimeType: 'image/jpeg', name: file.name })
            }
            img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('Failed to load image')) }
            img.src = URL.createObjectURL(file)
        })
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files) return
        const remaining = 3 - pendingImages.length
        if (remaining <= 0) {
            toast({ title: "Max 3 images", description: "Remove an image before adding more.", variant: "destructive" })
            return
        }
        const selected = Array.from(files).slice(0, remaining)
        try {
            const compressed = await Promise.all(selected.map(f => compressImage(f)))
            setPendingImages(prev => [...prev, ...compressed])
        } catch (err: any) {
            toast({ title: "Image error", description: err.message, variant: "destructive" })
        }
        // Reset so the same file can be re-selected
        e.target.value = ''
    }

    // Load Sessions
    useEffect(() => {
        if (workspaceId) {
            fetchSessions()
        }
    }, [workspaceId])

    const fetchSessions = async () => {
        try {
            const res = await fetch('/api/chat/sessions')
            if (res.ok) {
                const data = await res.json()
                setSessions(data)
            }
        } catch (e) {
            console.error(e)
        }
    }

    const loadSession = async (id: string) => {
        if (id === 'new') {
            setSessionId(null)
            setMessages([])
            return
        }

        setLoadingSessions(true)
        try {
            const res = await fetch(`/api/chat/sessions/${id}`)
            if (res.ok) {
                const data = await res.json()
                if (data.messages) {
                    setMessages(data.messages)
                    setSessionId(data.id)
                }
            }
        } catch (e) {
            toast({ title: "Error", description: "Failed to load chat history." })
        } finally {
            setLoadingSessions(false)
        }
    }

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    const [flowState, setFlowState] = useState<'idle' | 'awaiting_description' | 'awaiting_style' | 'awaiting_carousel_topic' | 'awaiting_carousel_style' | 'awaiting_idea_options' | 'awaiting_brand_image_mode' | 'awaiting_brand_image_upload' | 'awaiting_brand_image_options'>('idle')
    const [tempImagePrompt, setTempImagePrompt] = useState("")
    const [tempCarouselTopic, setTempCarouselTopic] = useState("")
    const [generatingSlide, setGeneratingSlide] = useState<number | null>(null)

    // Brand Image flow state
    const [tempBrandImageMode, setTempBrandImageMode] = useState<'generate' | 'transform' | null>(null)
    const [tempBrandImagePrompt, setTempBrandImagePrompt] = useState("")
    const [tempBrandImageRefs, setTempBrandImageRefs] = useState<MessageImage[]>([])

    // Create Post Modal State
    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false)
    const [draftCaption, setDraftCaption] = useState("")
    const [draftMedia, setDraftMedia] = useState<string[]>([])

    const requestGeneratedImage = async (prompt: string, style = "Photorealistic, cinematic lighting") => {
        if (!workspaceId) {
            throw new Error("No workspace selected")
        }

        const cleanPrompt = prompt.trim().slice(0, 2000)
        const data = await invokeEdge('generate-image', {
            messages: [{ role: 'user', content: cleanPrompt }],
            workspaceId,
            prompt: cleanPrompt,
            style,
        }) as any

        if (data?.error) {
            throw new Error(data.error)
        }

        const imageUrl = data?.result?.imageUrl
        if (!imageUrl) {
            throw new Error("No image generated")
        }

        return imageUrl as string
    }

    // Handlers for Content Card Actions
    const handleGenerateImage = async (_id: string, text: string) => {
        try {
            return await requestGeneratedImage(text)
        } catch (error) {
            throw new Error(sanitizeAssistantImageError(error instanceof Error ? error.message : "Image generation failed"))
        }
    }

    const handleSend = async (text?: string, overrideFunction?: string, extraPayload?: Record<string, unknown>) => {
        const messageText = text || input
        if (!messageText.trim()) return

        // HANDLE IMAGE FLOW STATE: Awaiting Description
        if (flowState === 'awaiting_description' && !overrideFunction) {
            // User sent the description
            setInput("")
            const newMessages: Message[] = [
                ...messages,
                { role: 'user', content: messageText },
                {
                    role: 'assistant',
                    content: `What style would you like for your "${messageText}" image?`,
                    type: 'style_selector'
                }
            ]
            setMessages(newMessages)
            setTempImagePrompt(messageText)
            setFlowState('awaiting_style')
            // Save conversational progress
            await saveSession(newMessages, sessionId)
            return
        }

        // HANDLE CAROUSEL FLOW STATE: Awaiting Topic
        if (flowState === 'awaiting_carousel_topic' && !overrideFunction) {
            setInput("")
            const newMessages: Message[] = [
                ...messages,
                { role: 'user', content: messageText },
                {
                    role: 'assistant',
                    content: `Let's create your Instagram carousel about "${messageText}"! Choose how many slides and the visual style:`,
                    type: 'carousel_style_selector',
                    data: { topic: messageText }
                }
            ]
            setMessages(newMessages)
            setTempCarouselTopic(messageText)
            setFlowState('awaiting_carousel_style')
            await saveSession(newMessages, sessionId)
            return
        }

        // HANDLE BRAND IMAGE FLOW STATE: Awaiting Upload + Description
        if (flowState === 'awaiting_brand_image_upload' && !overrideFunction) {
            setInput("")
            const refs = pendingImages.length > 0 ? [...pendingImages] : []
            setTempBrandImageRefs(refs)
            setTempBrandImagePrompt(messageText)
            setPendingImages([])

            const newMessages: Message[] = [
                ...messages,
                { role: 'user', content: messageText, images: refs.length > 0 ? refs : undefined },
                {
                    role: 'assistant',
                    content: `Configure your brand image ${tempBrandImageMode === 'transform' ? 'transformation' : 'generation'}:`,
                    type: 'brand_image_options',
                    data: {
                        mode: tempBrandImageMode,
                        prompt: messageText,
                        hasReferenceImages: refs.length > 0,
                        referenceCount: refs.length,
                    }
                }
            ]
            setMessages(newMessages)
            setFlowState('awaiting_brand_image_options')
            await saveSession(newMessages, sessionId)
            return
        }

        if (!workspaceId) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "⚠️ Please select a workspace first."
            }])
            return
        }

        const newMessages: Message[] = [...messages, {
            role: 'user',
            content: messageText,
            images: pendingImages.length > 0 ? pendingImages : undefined
        }]
        setMessages(newMessages)
        setInput("")
        setPendingImages([])
        setIsLoading(true)

        // 1. Save user message immediately & get Session ID
        let currentSessionId = sessionId
        try {
            const savedId = await saveSession(newMessages, sessionId)
            if (savedId) {
                currentSessionId = savedId
                if (currentSessionId !== sessionId) {
                    setSessionId(currentSessionId)
                }
            }
        } catch (e) {
            console.error("Failed to initial save:", e)
        }

        const targetFunction = overrideFunction || activeFunction || "chat-assistant"

        try {
            const data = await invokeEdge(targetFunction, {
                messages: newMessages,
                workspaceId,
                prompt: messageText,
                ...extraPayload
            }) as any
            if (data?.error) throw new Error(data.error)

            // Handle Structured Response
            let responseContent = "Done."
            let responseType: Message['type'] = 'text'
            let responseData = null

            if (data?.result) {
                // If the edge function returned a 'result' object (our new standard)
                const result = data.result
                if (result.type) {
                    responseType = result.type
                    responseData = result // Store full result for custom renderers
                    responseContent = result.message || "Here is what I generated:"
                } else if (typeof result === 'string') {
                    responseContent = result
                } else {
                    responseContent = JSON.stringify(result, null, 2)
                }
            } else if (data?.response) {
                // Legacy / Fallback for Functions returning { response: "text" }
                responseContent = data.response
            }

            // 2. Add assistant response & Save full history
            const finalMessages: Message[] = [...newMessages, {
                role: 'assistant',
                content: responseContent,
                type: responseType,
                data: responseData
            }]

            setMessages(finalMessages)
            await saveSession(finalMessages, currentSessionId)

        } catch (e: any) {
            console.error('Chat error:', e)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error: ${e.message}`,
                type: 'text'
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const saveSession = async (currentMessages: Message[], currentId: string | null): Promise<string | null> => {
        try {
            const url = currentId
                ? `/api/chat/sessions/${currentId}`
                : '/api/chat/sessions'

            const method = currentId ? 'PATCH' : 'POST'

            // Strip images from messages before persisting — no DB storage
            const messagesForStorage = currentMessages.map(({ images, ...rest }) => rest)

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messagesForStorage,
                    title: currentMessages[0]?.content?.slice(0, 40)
                })
            })

            if (res.status === 401) return currentId

            if (res.ok) {
                const newSession = await res.json()
                if (!currentId) {
                    setSessionId(newSession.id)
                    fetchSessions() // Refresh list
                }
                return newSession.id
            }
        } catch (e) {
            console.error("Failed to save session", e)
        }
        return currentId
    }

    const handleCardClick = (card: typeof ACTION_CARDS[0]) => {
        if (card.functionName === 'generate-image') {
            // Start Image Flow directly with AI generation
            setFlowState('awaiting_description')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What do you want the image to be about?"
            }])
            return
        }

        if (card.functionName === 'generate-carousel') {
            // Start Carousel Flow
            setFlowState('awaiting_carousel_topic')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What topic do you want the carousel to be about? Feel free to share any specific tips or points you'd like to include, or I can generate them for you!"
            }])
            return
        }

        if (card.functionName === 'brand-images') {
            setFlowState('awaiting_brand_image_mode')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What would you like to do with brand images?",
                type: 'brand_image_mode_selector'
            }])
            return
        }

        if (card.functionName === 'generate-ideas') {
            // Start Ideas Flow
            setFlowState('awaiting_idea_options')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Let's generate some content ideas! Choose your source and how many ideas you need:",
                type: 'idea_options_selector'
            }])
            return
        }

        setActiveFunction(card.functionName)
        if (card.prompt.endsWith("...") || card.prompt.endsWith(": ")) {
            setInput(card.prompt)
        } else {
            handleSend(card.prompt, card.functionName)
        }
    }

    const handleStyleSelect = async (style: string, enhance: boolean) => {
        setFlowState('idle') // End flow, start generating logic

        let finalPrompt = tempImagePrompt

        // If Magic Wand is on, enhance the prompt first
        if (enhance) {
            setIsLoading(true)
            // Add a temporary "Enhancing..." message
            setMessages(prev => [...prev, {
                role: 'user',
                content: `Generate a ${style} style image of: ${tempImagePrompt} (with Magic Wand ✨)`
            }])

            try {
                // Call generate-ideas just to rewrite the prompt
                // INSTRUCTION: strictly format output
                const data = await invokeEdge('chat-assistant', {
                    messages: [{ role: 'user', content: `Rewrite this image description to be highly detailed and optimized for AI image generation. Keep it under 2 sentences. Enclose the final prompt in <prompt> tags. Provide ONLY the tagged prompt. Description: "${tempImagePrompt}"` }],
                    workspaceId
                }) as any

                if (data?.response) {
                    const match = data.response.match(/<prompt>([\s\S]*?)<\/prompt>/)
                    if (match && match[1]) {
                        finalPrompt = match[1].trim()
                    } else {
                        // Fallback: use full response but strip quotes if wrapped
                        finalPrompt = data.response.replace(/^["']|["']$/g, '').trim()
                    }
                }
            } catch (e) {
                console.error("Enhancement failed, using original prompt", e)
            }
            setIsLoading(false)
        } else {
            setMessages(prev => [...prev, {
                role: 'user',
                content: `Generate a ${style} style image of: ${tempImagePrompt}`
            }])
        }

        // Trigger the actual generation
        handleSend(`Generate a ${style} style image of: ${finalPrompt}`, "generate-image")
    }

    const handleCarouselGenerate = async (slideCount: number, style: string, research?: boolean) => {
        setFlowState('idle')

        const userMsg = `Generate a Instagram carousel with ${slideCount} slides about "${tempCarouselTopic}" in ${style} style${research ? ' (with research)' : ''}`

        if (research) {
            setMessages(prev => [...prev, {
                role: 'user',
                content: userMsg
            }, {
                role: 'assistant',
                content: '🔍 Researching facts and trends for your carousel content...'
            }])
        } else {
            setMessages(prev => [...prev, {
                role: 'user',
                content: userMsg
            }])
        }

        // Trigger carousel generation
        handleSend(
            `Create a ${slideCount}-slide Instagram carousel about "${tempCarouselTopic}" in ${style} visual style. Generate engaging content for each slide with captions.`,
            "generate-carousel",
            research ? { research: true, researchQuery: tempCarouselTopic } : undefined
        )
    }

    const handleIdeaGenerate = async (type: 'auto' | 'custom', count: number, topic?: string, research?: boolean) => {
        setFlowState('idle')

        let prompt = ""
        let userMessage = ""

        if (type === 'custom' && topic) {
            userMessage = `Generate ${count} ideas about "${topic}"${research ? ' (with research)' : ''}`
            prompt = `Generate ${count} unique social media content ideas about "${topic}". For each idea, provide a catchy title and a brief description.`
        } else {
            userMessage = `Generate ${count} ideas based on my brand/context${research ? ' (with research)' : ''}`
            prompt = `Generate ${count} unique social media content ideas based on the brand's industry, voice, and recent activity. For each idea, provide a catchy title and a brief description.`
        }

        // Show research message if enabled
        if (research) {
            setMessages(prev => [...prev, {
                role: 'user',
                content: userMessage
            }, {
                role: 'assistant',
                content: '🔍 Researching current trends and news before generating ideas...'
            }])
        } else {
            setMessages(prev => [...prev, {
                role: 'user',
                content: userMessage
            }])
        }

        handleSend(prompt, "generate-ideas", research ? { research: true, researchQuery: topic || undefined } : undefined)
    }

    const handleBrandImageModeSelect = (mode: 'generate' | 'transform') => {
        setTempBrandImageMode(mode)
        setFlowState('awaiting_brand_image_upload')
        setMessages(prev => [...prev, {
            role: 'user',
            content: mode === 'generate' ? 'Generate New' : 'Transform Existing'
        }, {
            role: 'assistant',
            content: mode === 'generate'
                ? "Describe the image you want to create. You can attach reference images for style guidance!"
                : "Upload the image(s) you want to transform and describe the desired result."
        }])
    }

    const handleBrandImageGenerate = async (options: {
        imageCount: number
        style: string
        referenceMode: string | null
        transformAction: string | null
        enhance: boolean
    }) => {
        setFlowState('idle')

        let finalPrompt = tempBrandImagePrompt

        // Magic wand enhancement
        if (options.enhance) {
            setIsLoading(true)
            setMessages(prev => [...prev, {
                role: 'user',
                content: `Generate ${options.imageCount} ${options.style} brand image${options.imageCount > 1 ? 's' : ''}: ${tempBrandImagePrompt} (with Magic Wand)`
            }])

            try {
                const data = await invokeEdge('chat-assistant', {
                    messages: [{ role: 'user', content: `Rewrite this image description to be highly detailed and optimized for AI image generation. Keep it under 2 sentences. Enclose the final prompt in <prompt> tags. Provide ONLY the tagged prompt. Description: "${tempBrandImagePrompt}"` }],
                    workspaceId
                }) as any

                if (data?.response) {
                    const match = data.response.match(/<prompt>([\s\S]*?)<\/prompt>/)
                    if (match && match[1]) {
                        finalPrompt = match[1].trim()
                    } else {
                        finalPrompt = data.response.replace(/^["']|["']$/g, '').trim()
                    }
                }
            } catch (e) {
                console.error("Enhancement failed, using original prompt", e)
            }
            setIsLoading(false)
        } else {
            setMessages(prev => [...prev, {
                role: 'user',
                content: `Generate ${options.imageCount} ${options.style} brand image${options.imageCount > 1 ? 's' : ''}: ${tempBrandImagePrompt}`
            }])
        }

        // Build reference images payload (base64 array)
        const referenceImages = tempBrandImageRefs.map(img => ({
            base64: img.base64,
            mimeType: img.mimeType,
        }))

        setIsLoading(true)

        try {
            for (let i = 0; i < options.imageCount; i++) {
                const data = await invokeEdge('generate-image', {
                    messages: [{ role: 'user', content: finalPrompt }],
                    workspaceId,
                    prompt: finalPrompt,
                    style: options.style,
                    referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
                    referenceMode: options.referenceMode || undefined,
                    brandImageMode: tempBrandImageMode || undefined,
                    transformAction: options.transformAction || undefined,
                }) as any

                if (data?.error) throw new Error(data.error)

                const imageUrl = data?.result?.imageUrl
                if (imageUrl) {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: options.imageCount > 1 ? `Image ${i + 1} of ${options.imageCount}` : 'Here is your brand image:',
                        type: 'image',
                        data: {
                            id: data.result.id || `brand_img_${Date.now()}_${i}`,
                            imageUrl,
                            prompt_used: finalPrompt,
                        }
                    }])
                }
            }
        } catch (e: any) {
            console.error('Brand image generation failed:', e)
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error generating brand image: ${e.message}`
            }])
        } finally {
            setIsLoading(false)
            // Clean up temp state
            setTempBrandImageMode(null)
            setTempBrandImagePrompt("")
            setTempBrandImageRefs([])
        }
    }

    const handleGenerateSlideImage = async (slideNumber: number, prompt: string) => {
        if (!workspaceId) {
            toast({ title: "Error", description: "No workspace selected" })
            return
        }

        setGeneratingSlide(slideNumber)

        try {
            // Find the carousel style from the latest carousel message
            let carouselStyle = "Photorealistic, cinematic lighting" // Default

            const carouselMsg = [...messages].reverse().find(m => m.type === 'carousel_slides')
            if (carouselMsg && carouselMsg.data?.style) {
                carouselStyle = carouselMsg.data.style
            }

            const imageUrl = await requestGeneratedImage(prompt, carouselStyle)
            if (imageUrl) {
                // Update the messages state to include the new image URL for the specific slide
                setMessages(prevMessages => {
                    const newMessages = [...prevMessages]
                    // Find the last assistant message with carousel_slides
                    const carouselMsgIndex = newMessages.map(m => m).reverse().findIndex(m => m.type === 'carousel_slides')

                    if (carouselMsgIndex !== -1) {
                        // real index is length - 1 - reversedIndex
                        const realIndex = newMessages.length - 1 - carouselMsgIndex
                        const msg = { ...newMessages[realIndex] }
                        if (msg.data && msg.data.data) {
                            const slides = [...msg.data.data]
                            const slideIndex = slides.findIndex((s: any) => s.slide_number === slideNumber)
                            if (slideIndex !== -1) {
                                slides[slideIndex] = { ...slides[slideIndex], imageUrl }
                                msg.data = { ...msg.data, data: slides }
                                newMessages[realIndex] = msg

                                // Save session in background
                                saveSession(newMessages, sessionId)
                            }
                        }
                    }
                    return newMessages
                })
                toast({ title: "Image Generated", description: `Slide ${slideNumber} image ready!` })
            }

        } catch (e: any) {
            console.error("Failed to generate slide image:", e)
            toast({ title: "Generation failed", description: sanitizeAssistantImageError(e.message || "Image generation failed"), variant: "destructive" })
        } finally {
            setGeneratingSlide(null)
        }
    }

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text)
        toast({ title: "Copied!", duration: 1000 })
    }

    const handleRefine = (id: string, text: string) => {
        setInput(`Refine this post: "${text.substring(0, 50)}..." Make it shorter.`)
    }

    const handleSchedule = (id: string, text: string, images?: string | string[]) => {
        // Set draft content for modal
        setDraftCaption(text)
        if (images) {
            const mediaArray = Array.isArray(images) ? images : [images]
            setDraftMedia(mediaArray)
        } else {
            setDraftMedia([])
        }

        toast({ title: "Opening Scheduler...", description: "Draft created from idea." })
        setIsCreatePostModalOpen(true)
    }

    const handleDeleteSession = async (id: string) => {
        try {
            await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE' })
            setSessions(prev => prev.filter(s => s.id !== id))
            if (sessionId === id) {
                // If we deleted the active session, switch to new
                loadSession('new')
                toast({ title: "Chat deleted", description: "Session removed from history." })
            } else {
                toast({ title: "Chat deleted" })
            }
        } catch (error) {
            toast({ title: "Error", description: "Failed to delete chat" })
        }
    }

    // Handlers for Image Actions
    const handleDownloadImage = (url: string) => {
        const link = document.createElement('a')
        link.href = url
        link.download = `generated-image-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const handleUseImage = (url: string) => {
        // Set draft content for modal
        setDraftMedia([url])
        setDraftCaption(messages[messages.length - 1]?.content || '')

        toast({ title: "Opening Editor...", description: "Image attached to new post draft." })
        setIsCreatePostModalOpen(true)
    }

    return (
        <div
            className="flex flex-col h-[calc(100vh-8.5rem)] max-w-6xl mx-auto w-full overflow-hidden rounded-2xl"
            style={{
                background: ASSIST_THEME.shell,
                border: `1px solid ${ASSIST_THEME.border}`,
                boxShadow: '0 0 60px rgba(56,189,248,0.05)',
            }}
        >
            {/* ── TOOLBAR ── */}
            <div
                className="flex-none flex items-center justify-between gap-4 px-5 py-3"
                style={{
                    borderBottom: `1px solid ${ASSIST_THEME.borderSoft}`,
                    background: 'rgba(21,22,32,0.92)',
                    backdropFilter: 'blur(12px)',
                }}
            >
                <div className="flex items-center gap-2.5">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: ASSIST_THEME.textDim }}>
                        Assistant Active
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {/* History dialog */}
                    <Dialog>
                        <DialogTrigger asChild>
                            <button
                                className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150"
                                style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${ASSIST_THEME.border}`, color: ASSIST_THEME.textMuted }}
                                title="Chat History"
                            >
                                <History className="h-3.5 w-3.5" />
                            </button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[420px] border-white/10 bg-[#151620] text-white/85">
                            <DialogHeader>
                                <DialogTitle className="text-white/90">Chat History</DialogTitle>
                                <DialogDescription className="text-white/50">Select a previous conversation to resume or start a new chat.</DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-4 mt-2">
                                <div className="flex justify-end">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white"
                                        onClick={() => { loadSession('new'); setActiveFunction("chat-assistant"); toast({ title: "New Chat Started", duration: 1000 }) }}
                                        title="New Chat"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </div>
                                <ScrollArea className="h-[300px] pr-4">
                                    <div className="space-y-1.5">
                                        {sessions.map(s => (
                                            <div
                                                key={s.id}
                                                className="flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors"
                                                style={{
                                                    background: s.id === sessionId ? 'rgba(56,189,248,0.12)' : 'transparent',
                                                    border: s.id === sessionId ? '1px solid rgba(56,189,248,0.18)' : '1px solid transparent',
                                                }}
                                            >
                                                <button onClick={() => loadSession(s.id)} className="flex-1 text-left text-sm truncate px-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                                    {s.title || "Untitled Chat"}
                                                </button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10">
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent className="border-white/10 bg-[#1b1d28] text-white/85">
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle className="text-white/90">Delete this chat?</AlertDialogTitle>
                                                            <AlertDialogDescription className="text-white/50">This action cannot be undone.</AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel className="border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white">Cancel</AlertDialogCancel>
                                                            <AlertDialogAction onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }} className="border border-red-500/25 bg-red-500/15 text-red-300 hover:bg-red-500/20">Delete</AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ))}
                                        {sessions.length === 0 && (
                                            <div className="py-10 text-center text-sm" style={{ color: 'rgba(255,255,255,0.25)' }}>No chat history yet.</div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </DialogContent>
                    </Dialog>

                    {/* New chat */}
                    <button
                        className="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150"
                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${ASSIST_THEME.border}`, color: ASSIST_THEME.textMuted }}
                        onClick={() => { loadSession('new'); setActiveFunction("chat-assistant"); toast({ title: "New Chat Started", duration: 1000 }) }}
                        title="New Chat"
                    >
                        <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>

            {/* ── MESSAGES ── */}
            <div className="flex-1 min-h-0 relative">
                <ScrollArea className="h-full w-full" ref={scrollRef}>
                    <div className="p-3 sm:p-5 max-w-4xl mx-auto">

                        {/* Empty state */}
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center min-h-[58vh] gap-10 animate-in fade-in zoom-in duration-500">
                                <div className="text-center space-y-3">
                                    <div
                                        className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
                                        style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)', boxShadow: '0 0 40px rgba(56,189,248,0.22)' }}
                                    >
                                        <Bot className="h-7 w-7 text-white" />
                                    </div>
                                    <h1
                                        className="text-3xl font-bold tracking-tight"
                                        style={{ background: 'linear-gradient(135deg, #dff6ff, #fcd34d)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                                    >
                                        AI Assistant
                                    </h1>
                                    <p className="text-base" style={{ color: 'rgba(255,255,255,0.38)' }}>
                                        Your social media copilot. Ask me anything!
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full max-w-3xl">
                                    {ACTION_CARDS.map((card, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleCardClick(card)}
                                            className="group flex sm:flex-col items-center sm:items-start gap-3 sm:gap-0 p-3 sm:p-5 rounded-xl text-left transition-all duration-200 sm:hover:-translate-y-1"
                                            style={{
                                                background: ASSIST_THEME.shellAlt,
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(56,189,248,0.22)'
                                                e.currentTarget.style.boxShadow = '0 8px 24px rgba(56,189,248,0.08)'
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                                                e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.3)'
                                            }}
                                        >
                                            <div
                                                className="shrink-0 sm:mb-4 flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl transition-all duration-200 group-hover:scale-110"
                                                style={{ background: 'rgba(56,189,248,0.12)' }}
                                            >
                                                <card.icon className="h-4 w-4 sm:h-5 sm:w-5" style={{ color: ASSIST_THEME.cyan }} />
                                            </div>
                                            <div>
                                                <h3 className="font-semibold text-sm mb-0.5 sm:mb-1" style={{ color: 'rgba(255,255,255,0.85)' }}>{card.title}</h3>
                                                <p className="text-xs leading-relaxed hidden sm:block" style={{ color: 'rgba(255,255,255,0.35)' }}>{card.description}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Messages */}
                        <div className="space-y-5 pb-4 max-w-3xl mx-auto">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                                    {/* Bot avatar */}
                                    {msg.role === 'assistant' && (
                                        <div
                                            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                            style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)', boxShadow: '0 0 16px rgba(56,189,248,0.2)' }}
                                        >
                                            <Bot className="h-4 w-4 text-white" />
                                        </div>
                                    )}

                                    <div className={`flex flex-col gap-2 max-w-[90%] sm:max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                                        {/* Text bubble */}
                                        {msg.content && (
                                            <div
                                                className="relative group px-4 py-3 rounded-2xl text-sm leading-relaxed"
                                                style={msg.role === 'user' ? {
                                                    background: 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(251,113,133,0.2))',
                                                    border: '1px solid rgba(56,189,248,0.18)',
                                                    color: 'white',
                                                    borderBottomRightRadius: '4px',
                                                    boxShadow: '0 4px 16px rgba(56,189,248,0.08)',
                                                } : {
                                                    background: ASSIST_THEME.shellAlt,
                                                    border: `1px solid ${ASSIST_THEME.border}`,
                                                    color: 'rgba(255,255,255,0.8)',
                                                    borderBottomLeftRadius: '4px',
                                                }}
                                            >
                                                {msg.content}
                                                {msg.role === 'assistant' && (
                                                    <button
                                                        className="absolute -right-7 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex h-6 w-6 items-center justify-center rounded-md"
                                                        style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}
                                                        onClick={() => handleCopy(msg.content)}
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Attached images in user messages */}
                                        {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                                            <div className="flex gap-2 mt-1">
                                                {msg.images.map((img, j) => (
                                                    <img
                                                        key={j}
                                                        src={`data:${img.mimeType};base64,${img.base64}`}
                                                        alt={img.name}
                                                        className="w-20 h-20 object-cover rounded-lg border border-white/10"
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* Content cards */}
                                        {msg.type === 'content_cards' && msg.data?.data && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                {msg.data.data.map((card: any, idx: number) => (
                                                    <ContentCard key={idx} id={card.id || idx.toString()} title={card.title} body={card.body} workspaceId={workspaceId} onGenerateImage={handleGenerateImage} onRefine={handleRefine} onSchedule={handleSchedule} />
                                                ))}
                                            </div>
                                        )}

                                        {/* Carousel preview */}
                                        {msg.type === 'carousel_slides' && msg.data?.data && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <CarouselPreview slots={msg.data.data} caption={msg.data.caption} onGenerateImage={handleGenerateSlideImage} onSchedule={handleSchedule} generatingSlide={generatingSlide} />
                                            </div>
                                        )}

                                        {/* Image preview */}
                                        {msg.type === 'image' && msg.data && (
                                            <div className="w-full max-w-sm mt-1 animate-in fade-in zoom-in-50">
                                                <ImagePreview id={msg.data.id} imageUrl={msg.data.imageUrl} promptUsed={msg.data.prompt_used} onDownload={handleDownloadImage} onUseInPost={handleUseImage} onRegenerate={(prompt) => handleSend(`Regenerate: ${prompt}`, "generate-image")} />
                                            </div>
                                        )}

                                        {/* Style selector */}
                                        {msg.type === 'style_selector' && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <StyleSelector onSelect={handleStyleSelect} isGenerating={isLoading && flowState === 'idle'} />
                                            </div>
                                        )}

                                        {/* Carousel style selector */}
                                        {msg.type === 'carousel_style_selector' && msg.data && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <CarouselStyleSelector topic={msg.data.topic} onGenerate={handleCarouselGenerate} isGenerating={isLoading} />
                                            </div>
                                        )}

                                        {/* Idea options */}
                                        {msg.type === 'idea_options_selector' && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <IdeaOptionsSelector onGenerate={handleIdeaGenerate} isLoading={isLoading} />
                                            </div>
                                        )}

                                        {/* Brand image mode selector */}
                                        {msg.type === 'brand_image_mode_selector' && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <BrandImageModeSelector onSelect={handleBrandImageModeSelect} />
                                            </div>
                                        )}

                                        {/* Brand image options */}
                                        {msg.type === 'brand_image_options' && msg.data && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <BrandImageOptions
                                                    mode={msg.data.mode}
                                                    prompt={msg.data.prompt}
                                                    hasReferenceImages={msg.data.hasReferenceImages}
                                                    referenceCount={msg.data.referenceCount}
                                                    onGenerate={handleBrandImageGenerate}
                                                    isGenerating={isLoading}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* User avatar */}
                                    {msg.role === 'user' && (
                                        <div
                                            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                            style={{ background: '#1b1d28', border: `1px solid ${ASSIST_THEME.border}` }}
                                        >
                                            <User className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.5)' }} />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Loading dots */}
                            {isLoading && (
                                <div className="flex gap-3">
                                    <div
                                        className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 animate-pulse"
                                        style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)' }}
                                    >
                                        <Bot className="h-4 w-4 text-white" />
                                    </div>
                                    <div
                                        className="flex items-center gap-1.5 px-4 py-3 rounded-2xl"
                                        style={{ background: ASSIST_THEME.shellAlt, border: `1px solid ${ASSIST_THEME.borderSoft}`, borderBottomLeftRadius: '4px' }}
                                    >
                                        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" style={{ background: ASSIST_THEME.cyan }} />
                                        <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" style={{ background: ASSIST_THEME.coral }} />
                                        <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: ASSIST_THEME.amber }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* ── INPUT ── */}
            {/* ── INPUT ── */}
            <div
                className="flex-none p-4"
                style={{ borderTop: `1px solid ${ASSIST_THEME.borderSoft}`, background: 'rgba(21,22,32,0.86)' }}
            >
                <div className="max-w-3xl mx-auto">
                    {/* Pending image preview strip */}
                    {pendingImages.length > 0 && (
                        <div className="flex gap-2 mb-2 px-1">
                            {pendingImages.map((img, i) => (
                                <div key={i} className="relative group">
                                    <img
                                        src={`data:${img.mimeType};base64,${img.base64}`}
                                        alt={img.name}
                                        className="w-16 h-16 object-cover rounded-lg border border-white/10"
                                    />
                                    <button
                                        onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500/90 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="relative flex items-center">
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isLoading || pendingImages.length >= 3}
                            className="absolute left-2 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-150 disabled:opacity-30 hover:bg-white/10"
                            style={{ color: 'rgba(255,255,255,0.4)' }}
                            title="Attach image"
                        >
                            <Paperclip className="h-4 w-4" />
                        </button>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                            placeholder={activeFunction !== 'chat-assistant' ? `Using ${activeFunction}…` : "Ask me anything…"}
                            className="w-full rounded-xl py-3.5 pl-11 pr-14 text-sm outline-none transition-all"
                            style={{
                                background: ASSIST_THEME.shellAlt,
                                border: `1px solid ${ASSIST_THEME.border}`,
                                color: 'rgba(255,255,255,0.85)',
                            }}
                            onFocus={(e) => (e.currentTarget.style.borderColor = 'rgba(56,189,248,0.25)')}
                            onBlur={(e) => (e.currentTarget.style.borderColor = ASSIST_THEME.border)}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={isLoading || (!input.trim() && pendingImages.length === 0)}
                            className="absolute right-2 flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150 disabled:opacity-30 hover:opacity-85 active:scale-95"
                            style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)' }}
                        >
                            <ArrowUp className="h-4 w-4 text-white" />
                        </button>
                    </div>
                    <p className="mt-2 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        AI can make mistakes. Check important info.
                    </p>
                </div>
            </div>

            {/* Create Post Modal */}
            <CreatePostModal
                open={isCreatePostModalOpen}
                onOpenChange={(open) => {
                    setIsCreatePostModalOpen(open)
                    if (!open) { setDraftCaption(""); setDraftMedia([]) }
                }}
                workspaceId={workspaceId || ""}
                initialCaption={draftCaption}
                initialMedia={draftMedia}
            />
        </div>
    )
}
