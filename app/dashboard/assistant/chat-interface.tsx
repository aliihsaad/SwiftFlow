"use client"

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Bot,
    User,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { ContentCard } from "./components/content-card"
import { CarouselPreview } from "./components/carousel-preview"
import { ImagePreview } from "./components/image-preview"
import { StyleSelector } from "./components/style-selector"
import { CarouselStyleSelector } from "./components/carousel-style-selector"
import { IdeaOptionsSelector } from "./components/idea-options-selector"
import { BrandImageModeSelector, BrandImageOptions } from "./components/brand-image-options"
import { CreatePostModal } from "@/components/create/create-post-modal"
import type {
    AssistantFlowState,
    AssistantFunctionName,
    AssistantMessage,
    AssistantMode,
    AssistantQuickStart,
    MessageImage,
} from './assistant-types'
import {
    ASSISTANT_MODES,
    ASSISTANT_QUICK_STARTS,
    ASSISTANT_THEME as ASSIST_THEME,
} from './assistant-config'
import { AssistantModeSwitcher } from './components/command-center/mode-switcher'
import { AssistantEmptyState } from './components/command-center/empty-state'
import { AssistantComposer } from './components/command-center/composer'
import { AssistantContextReceiptView } from './components/command-center/context-receipt'
import { AssistantHistoryControls } from './components/command-center/history-controls'
import { AssistantLoadingBubble } from './components/command-center/loading-bubble'
import { AssistantResponseView } from './components/command-center/assistant-response'
import type { AssistantCommandResponse } from '@/lib/assistant/context-types'
import { routeAssistantIntent } from '@/lib/assistant/intent-router'
import { getAssistantModeActions, type AssistantQuickAction } from '@/lib/assistant/quick-actions'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import { cn } from '@/lib/utils'

interface ChatInterfaceProps {
    workspaceId?: string
}

function sanitizeAssistantImageError(msg: string): string {
    const normalized = msg.trim()
    if (/No endpoints found that support the requested output modalities|output modalities: image, text|No endpoints found for|model not found|not available/i.test(normalized)) {
        return "The selected image model is not currently available through your AI provider route. Choose another image model in Settings -> AI Provider."
    }
    if (/provider returned error/i.test(normalized)) {
        return "Your AI provider could not generate an image with the current image model. Try again or switch the image model in Settings -> AI Provider."
    }
    if (/quota|rate limit|too many requests/i.test(normalized)) {
        return "Your AI image provider is rate-limited or out of quota right now. Try again shortly."
    }
    if (/api key|unauthorized|forbidden|permission/i.test(normalized)) {
        return "Your AI image provider credentials need attention. Check Settings -> AI Provider."
    }
    return normalized || "Image generation failed. Please try again."
}

export function ChatInterface({ workspaceId }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<AssistantMessage[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [activeQuickActionId, setActiveQuickActionId] = useState<string | null>(null)
    const [selectedMode, setSelectedMode] = useState<AssistantMode>('create')
    const [lastFunctionName, setLastFunctionName] = useState<AssistantFunctionName>('chat-assistant')

    // History State
    const [sessions, setSessions] = useState<{ id: string, title: string }[]>([])
    const [sessionId, setSessionId] = useState<string | null>(null)
    // Image attachment state
    const [pendingImages, setPendingImages] = useState<MessageImage[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)

    const { toast } = useToast()
    const scrollRef = useRef<HTMLDivElement>(null)
    const isMobile = useIsMobile()

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

    const invokeCommand = async (body: Record<string, unknown>): Promise<AssistantCommandResponse> => {
        const response = await fetch('/api/assistant/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })

        let payload: any = null
        try {
            payload = await response.json()
        } catch {
            payload = null
        }

        if (!response.ok) {
            throw new Error(payload?.error || 'Assistant command failed')
        }

        return payload as AssistantCommandResponse
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

        try {
            const res = await fetch(`/api/chat/sessions/${id}`)
            if (res.ok) {
                const data = await res.json()
                if (data.messages) {
                    setMessages(data.messages)
                    setSessionId(data.id)
                }
            }
        } catch {
            toast({ title: "Error", description: "Failed to load chat history." })
        }
    }

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    const [flowState, setFlowState] = useState<AssistantFlowState>('idle')
    const [tempImagePrompt, setTempImagePrompt] = useState("")
    const [tempCarouselTopic, setTempCarouselTopic] = useState("")
    const [generatingSlide, setGeneratingSlide] = useState<number | null>(null)
    const [slideImageErrors, setSlideImageErrors] = useState<Record<number, string>>({})

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
            throw new Error(sanitizeAssistantImageError("No workspace selected"))
        }

        const cleanPrompt = prompt.trim().slice(0, 1200)
        const data = await invokeEdge('generate-image', {
            workspaceId,
            prompt: cleanPrompt,
            style,
        }) as any

        if (data?.error) {
            throw new Error(sanitizeAssistantImageError(data.error))
        }

        const imageUrl = data?.result?.imageUrl
        if (!imageUrl) {
            throw new Error(sanitizeAssistantImageError("No image generated"))
        }

        return imageUrl as string
    }

    // Handlers for Content Card Actions
    const handleGenerateImage = async (_id: string, text: string) => {
        try {
            const contentPrompt = `Create a polished social media image based on this content idea: ${text.slice(0, 500)}`
            return await requestGeneratedImage(contentPrompt)
        } catch (error) {
            throw new Error(sanitizeAssistantImageError(error instanceof Error ? error.message : "Image generation failed"))
        }
    }

    const handleSend = async (text?: string, overrideFunction?: AssistantFunctionName, extraPayload?: Record<string, unknown>) => {
        const messageText = text || input
        if (!messageText.trim()) return

        // HANDLE IMAGE FLOW STATE: Awaiting Description
        if (flowState === 'awaiting_description' && !overrideFunction) {
            // User sent the description
            setInput("")
            const newMessages: AssistantMessage[] = [
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
            const newMessages: AssistantMessage[] = [
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

            const newMessages: AssistantMessage[] = [
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

        const newMessages: AssistantMessage[] = [...messages, {
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

        const routedIntent = routeAssistantIntent({
            message: messageText,
            selectedMode,
            overrideFunctionName: overrideFunction,
        })

        setSelectedMode(routedIntent.mode)
        setLastFunctionName(routedIntent.functionName)

        const targetFunction = routedIntent.functionName

        try {
            const commandBody = {
                messages: newMessages,
                workspaceId,
                message: messageText,
                mode: routedIntent.mode,
                action: routedIntent.action,
                functionName: targetFunction,
                confidence: routedIntent.confidence,
                needsClarification: routedIntent.needsClarification,
                prompt: messageText,
                assistantIntent: {
                    mode: routedIntent.mode,
                    action: routedIntent.action,
                    confidence: routedIntent.confidence,
                },
                ...extraPayload
            }

            const commandResponse = targetFunction === 'chat-assistant'
                ? await invokeCommand(commandBody)
                : null

            const data = commandResponse
                ? commandResponse.data as any
                : await invokeEdge(targetFunction, commandBody) as any
            if (data?.error) throw new Error(data.error)

            // Handle Structured Response
            let responseContent = "Done."
            let responseType: AssistantMessage['type'] = 'text'
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
            const finalMessages: AssistantMessage[] = [...newMessages, {
                role: 'assistant',
                content: responseContent,
                type: responseType,
                data: responseData,
                contextReceipt: commandResponse?.contextReceipt,
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

    const saveSession = async (currentMessages: AssistantMessage[], currentId: string | null): Promise<string | null> => {
        try {
            const url = currentId
                ? `/api/chat/sessions/${currentId}`
                : '/api/chat/sessions'

            const method = currentId ? 'PATCH' : 'POST'

            // Strip images from messages before persisting — no DB storage
            const messagesForStorage = currentMessages.map((message) => {
                const messageForStorage = { ...message }
                delete messageForStorage.images
                return messageForStorage
            })

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

    const handleQuickStart = (quickStart: AssistantQuickStart) => {
        setSelectedMode(quickStart.mode)
        setLastFunctionName(
            quickStart.functionName === 'brand-images'
                ? 'chat-assistant'
                : quickStart.functionName,
        )

        if (quickStart.functionName === 'generate-image') {
            setFlowState('awaiting_description')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What do you want the image to be about?"
            }])
            return
        }

        if (quickStart.functionName === 'generate-carousel') {
            setFlowState('awaiting_carousel_topic')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What topic do you want the carousel to be about? Share any specific tips or points, or I can generate them."
            }])
            return
        }

        if (quickStart.functionName === 'brand-images') {
            setFlowState('awaiting_brand_image_mode')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "What would you like to do with brand images?",
                type: 'brand_image_mode_selector'
            }])
            return
        }

        if (quickStart.functionName === 'generate-ideas') {
            setFlowState('awaiting_idea_options')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Let's generate content ideas. Choose your source and how many ideas you need:",
                type: 'idea_options_selector'
            }])
            return
        }

        if (quickStart.prompt.endsWith(' ')) {
            setInput(quickStart.prompt)
        } else {
            handleSend(quickStart.prompt, quickStart.functionName)
        }
    }

    const handleAssistantQuickAction = async (action: AssistantQuickAction) => {
        if (isLoading || activeQuickActionId) return

        setLastFunctionName(action.functionName)

        if (action.intent === 'set_input') {
            setInput(action.prompt)
            return
        }

        if (action.intent === 'start_draft') {
            setActiveQuickActionId(action.id)
            setDraftCaption(action.prompt)
            setDraftMedia([])
            setIsCreatePostModalOpen(true)
            toast({ title: "Draft started", description: "Opened the post editor with the recommendation." })
            setActiveQuickActionId(null)
            return
        }

        if (action.intent === 'start_image_flow') {
            const imagePrompt = action.prompt.trim()
            setActiveQuickActionId(action.id)

            if (imagePrompt) {
                setTempImagePrompt(imagePrompt)
                setFlowState('awaiting_style')
                setMessages(prev => [...prev, {
                    role: 'user',
                    content: `Create image from recommendation: ${imagePrompt}`,
                }, {
                    role: 'assistant',
                    content: `Choose a visual style for this image: "${imagePrompt}"`,
                    type: 'style_selector',
                }])
            } else {
                setFlowState('awaiting_description')
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: action.guidance || "What do you want the image to be about?",
                }])
            }

            setActiveQuickActionId(null)
            return
        }

        if (action.intent === 'start_carousel_flow') {
            const carouselTopic = action.prompt.trim()
            setActiveQuickActionId(action.id)

            if (carouselTopic) {
                setTempCarouselTopic(carouselTopic)
                setFlowState('awaiting_carousel_style')
                setMessages(prev => [...prev, {
                    role: 'user',
                    content: `Make a carousel from recommendation: ${carouselTopic}`,
                }, {
                    role: 'assistant',
                    content: `Choose carousel settings for: "${carouselTopic}"`,
                    type: 'carousel_style_selector',
                    data: { topic: carouselTopic },
                }])
            } else {
                setFlowState('awaiting_carousel_topic')
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: action.guidance || "What topic do you want the carousel to be about?",
                }])
            }

            setActiveQuickActionId(null)
            return
        }

        setActiveQuickActionId(action.id)
        try {
            await handleSend(action.prompt, action.functionName)
        } finally {
            setActiveQuickActionId(null)
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

        setSlideImageErrors(prev => {
            const next = { ...prev }
            delete next[slideNumber]
            return next
        })
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
            const friendlyError = sanitizeAssistantImageError(e.message || "Image generation failed")
            setSlideImageErrors(prev => ({ ...prev, [slideNumber]: friendlyError }))
            toast({ title: "Generation failed", description: friendlyError, variant: "destructive" })
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
        } catch {
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

    const handleNewChat = () => {
        loadSession('new')
        setSelectedMode('create')
        setLastFunctionName('chat-assistant')
        toast({ title: 'New Chat Started', duration: 1000 })
    }

    return (
        <div
            className={cn(
                "mx-auto flex h-[calc(100vh-7.75rem)] w-full max-w-6xl flex-col overflow-hidden rounded-none sm:h-[calc(100vh-8.5rem)] sm:rounded-xl",
                isMobile && "fixed inset-0 z-50 h-[100dvh] max-w-none border-0 sm:h-[100dvh] sm:rounded-none",
            )}
            style={{
                background: ASSIST_THEME.shell,
                border: isMobile ? '0' : `1px solid ${ASSIST_THEME.border}`,
                boxShadow: '0 0 60px rgba(56,189,248,0.05)',
            }}
        >
            {/* ── TOOLBAR ── */}
            <div
                className={cn(
                    "flex-none flex items-center justify-between gap-4 px-5 py-3",
                    isMobile && "sticky top-0 z-20 gap-2 px-3 py-2.5",
                )}
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
                        {isMobile ? 'Assistant' : 'Assistant Active'}
                    </span>
                    <span className="hidden text-[11px] text-white/25 sm:inline">
                        {lastFunctionName}
                    </span>
                </div>

                <AssistantHistoryControls
                    sessions={sessions}
                    sessionId={sessionId}
                    onLoadSession={loadSession}
                    onNewChat={handleNewChat}
                    onDeleteSession={handleDeleteSession}
                />
            </div>

            <div className={cn("flex-none border-b border-white/6 px-3 py-2 sm:px-5", isMobile && "px-2 py-2")}>
                <div className={cn("mx-auto max-w-4xl", isMobile && "max-w-none")}>
                    <AssistantModeSwitcher
                        modes={ASSISTANT_MODES}
                        selectedMode={selectedMode}
                        onModeChange={setSelectedMode}
                        compact
                    />
                </div>
            </div>

            {/* ── MESSAGES ── */}
            <div className="flex-1 min-h-0 relative">
                <ScrollArea className="h-full w-full" ref={scrollRef}>
                    <div className={cn("p-3 sm:p-5 max-w-4xl mx-auto", isMobile && "max-w-none px-2 py-3")}>

                        {/* Empty state */}
                        {messages.length === 0 && (
                            <AssistantEmptyState
                                quickStarts={ASSISTANT_QUICK_STARTS}
                                onQuickStart={handleQuickStart}
                                isMobile={isMobile}
                            />
                        )}

                        {/* Messages */}
                        <div className={cn("space-y-5 pb-4 max-w-3xl mx-auto", isMobile && "max-w-none space-y-3 pb-3")}>
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex gap-3",
                                        msg.role === 'user' ? 'justify-end' : 'justify-start',
                                        isMobile && 'gap-2',
                                    )}
                                >

                                    {/* Bot avatar */}
                                    {msg.role === 'assistant' && !isMobile && (
                                        <div
                                            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                                            style={{ background: 'linear-gradient(135deg, #38bdf8, #fb7185)', boxShadow: '0 0 16px rgba(56,189,248,0.2)' }}
                                        >
                                            <Bot className="h-4 w-4 text-white" />
                                        </div>
                                    )}

                                    <div
                                        className={cn(
                                            "flex flex-col gap-2 max-w-[90%] sm:max-w-[85%]",
                                            msg.role === 'user' ? 'items-end' : 'items-start',
                                            isMobile && msg.role === 'assistant' && 'w-full max-w-none items-stretch',
                                            isMobile && msg.role === 'user' && 'max-w-[90%]',
                                        )}
                                    >

                                        {/* Text bubble */}
                                        {msg.content && (
                                            msg.role === 'assistant' && (!msg.type || msg.type === 'text') ? (
                                                <AssistantResponseView
                                                    content={msg.content}
                                                    contextReceipt={msg.contextReceipt}
                                                    onCopy={handleCopy}
                                                    onQuickAction={handleAssistantQuickAction}
                                                    activeActionId={activeQuickActionId}
                                                    isMobile={isMobile}
                                                />
                                            ) : (
                                                <div
                                                    className={cn("relative group px-4 py-3 rounded-2xl text-sm leading-relaxed", isMobile && "px-3.5 py-2.5 text-[13px]")}
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
                                                </div>
                                            )
                                        )}

                                        {/* Attached images in user messages */}
                                        {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                                            <div className={cn("flex gap-2 mt-1", isMobile && "max-w-full overflow-x-auto pb-1")}>
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
                                                    <ContentCard key={idx} id={card.id || idx.toString()} title={card.title} body={card.body} onGenerateImage={handleGenerateImage} onRefine={handleRefine} onSchedule={handleSchedule} />
                                                ))}
                                            </div>
                                        )}

                                        {/* Carousel preview */}
                                        {msg.type === 'carousel_slides' && msg.data?.data && (
                                            <div className="w-full mt-1 animate-in fade-in slide-in-from-bottom-2">
                                                <CarouselPreview slots={msg.data.data} caption={msg.data.caption} onGenerateImage={handleGenerateSlideImage} onSchedule={handleSchedule} generatingSlide={generatingSlide} slideImageErrors={slideImageErrors} />
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

                                        {msg.role === 'assistant' && (
                                            <AssistantContextReceiptView receipt={msg.contextReceipt} />
                                        )}
                                    </div>

                                    {/* User avatar */}
                                    {msg.role === 'user' && !isMobile && (
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
                            {isLoading && <AssistantLoadingBubble />}
                        </div>
                    </div>
                </ScrollArea>
            </div>

            <AssistantComposer
                input={input}
                selectedMode={selectedMode}
                pendingImages={pendingImages}
                isLoading={isLoading}
                activeActionId={activeQuickActionId}
                fileInputRef={fileInputRef}
                quickActions={getAssistantModeActions(selectedMode)}
                onInputChange={setInput}
                onSend={() => handleSend()}
                onQuickAction={handleAssistantQuickAction}
                onFileSelect={handleFileSelect}
                onRemoveImage={(index) => setPendingImages(prev => prev.filter((_, itemIndex) => itemIndex !== index))}
                isMobile={isMobile}
            />

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
