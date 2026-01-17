"use client"

import { useRouter } from "next/navigation"

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
    CalendarDays,
    BarChart3,
    ArrowUp,
    Copy,
    RefreshCw,
    History,
    Trash2
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
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import { ContentCard } from "./components/content-card"
import { CarouselPreview } from "./components/carousel-preview"
import { ImagePreview } from "./components/image-preview"
import { StyleSelector } from "./components/style-selector"
import { CarouselStyleSelector } from "./components/carousel-style-selector"
import { IdeaOptionsSelector } from "./components/idea-options-selector"
import { ImageSourceSelector } from "./components/image-source-selector"
import { UnsplashResults } from "./components/unsplash-results"
import { CreatePostModal } from "@/components/create/create-post-modal"

interface Message {
    role: 'user' | 'assistant'
    content: string
    type?: 'text' | 'content_cards' | 'carousel_slides' | 'image' | 'style_selector' | 'carousel_style_selector' | 'idea_options_selector' | 'image_source_selector' | 'unsplash_results'
    data?: any
}

interface ChatInterfaceProps {
    workspaceId?: string
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
    }
]

export function ChatInterface({ workspaceId }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [activeFunction, setActiveFunction] = useState<string>("chat-assistant")

    // History State
    const [sessions, setSessions] = useState<{ id: string, title: string }[]>([])
    const [sessionId, setSessionId] = useState<string | null>(null)
    const [loadingSessions, setLoadingSessions] = useState(false)

    const { toast } = useToast()
    const supabase = createClient()
    const scrollRef = useRef<HTMLDivElement>(null)

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

    const [flowState, setFlowState] = useState<'idle' | 'awaiting_description' | 'awaiting_image_source' | 'awaiting_style' | 'awaiting_unsplash_query' | 'awaiting_carousel_topic' | 'awaiting_carousel_style' | 'awaiting_idea_options'>('idle')
    const [tempImagePrompt, setTempImagePrompt] = useState("")
    const [tempCarouselTopic, setTempCarouselTopic] = useState("")
    const [generatingSlide, setGeneratingSlide] = useState<number | null>(null)
    const [selectedImageSource, setSelectedImageSource] = useState<'ai' | 'unsplash' | null>(null)
    const [unsplashResults, setUnsplashResults] = useState<any[]>([])
    const [selectedUnsplashId, setSelectedUnsplashId] = useState<string | null>(null)

    // Create Post Modal State
    const [isCreatePostModalOpen, setIsCreatePostModalOpen] = useState(false)
    const [draftCaption, setDraftCaption] = useState("")
    const [draftMedia, setDraftMedia] = useState<string[]>([])

    // Handlers for Content Card Actions
    const handleGenerateImage = (id: string, text: string) => {
        // Trigger image generation based on content
        handleSend(`Generate an image for this post: "${text.substring(0, 100)}..."`, "generate-image")
    }

    const handleSend = async (text?: string, overrideFunction?: string) => {
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

        // HANDLE UNSPLASH FLOW STATE: Awaiting Search Query
        if (flowState === 'awaiting_unsplash_query' && !overrideFunction) {
            setInput("")
            setMessages(prev => [...prev, { role: 'user', content: messageText }])
            handleUnsplashSearch(messageText)
            return
        }

        if (!workspaceId) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "⚠️ Please select a workspace first."
            }])
            return
        }

        const newMessages: Message[] = [...messages, { role: 'user', content: messageText }]
        setMessages(newMessages)
        setInput("")
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
            const { data, error } = await supabase.functions.invoke(targetFunction, {
                body: { messages: newMessages, workspaceId, prompt: messageText }
            })

            if (error) throw new Error(error.message)
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

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: currentMessages,
                    title: currentMessages[0]?.content?.slice(0, 40)
                })
            })

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
            // Start Image Flow - Show source selector
            setFlowState('awaiting_image_source')
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "How would you like to get your image?",
                type: 'image_source_selector'
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
                const { data } = await supabase.functions.invoke('chat-assistant', {
                    body: {
                        messages: [{ role: 'user', content: `Rewrite this image description to be highly detailed and optimized for AI image generation. Keep it under 2 sentences. Enclose the final prompt in <prompt> tags. Provide ONLY the tagged prompt. Description: "${tempImagePrompt}"` }],
                        workspaceId
                    }
                })

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

    const handleCarouselGenerate = async (slideCount: number, style: string) => {
        setFlowState('idle')

        setMessages(prev => [...prev, {
            role: 'user',
            content: `Generate a Instagram carousel with ${slideCount} slides about "${tempCarouselTopic}" in ${style} style`
        }])

        // Trigger carousel generation
        handleSend(
            `Create a ${slideCount}-slide Instagram carousel about "${tempCarouselTopic}" in ${style} visual style. Generate engaging content for each slide with captions.`,
            "generate-carousel"
        )
    }

    const handleIdeaGenerate = async (type: 'auto' | 'custom', count: number, topic?: string) => {
        setFlowState('idle')

        let prompt = ""
        let userMessage = ""

        if (type === 'custom' && topic) {
            userMessage = `Generate ${count} ideas about "${topic}"`
            prompt = `Generate ${count} unique social media content ideas about "${topic}". For each idea, provide a catchy title and a brief description.`
        } else {
            userMessage = `Generate ${count} ideas based on my brand/context`
            prompt = `Generate ${count} unique social media content ideas based on the brand's industry, voice, and recent activity. For each idea, provide a catchy title and a brief description.`
        }

        setMessages(prev => [...prev, {
            role: 'user',
            content: userMessage
        }])

        handleSend(prompt, "generate-ideas")
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

            // Call generate-image edge function directly
            const { data, error } = await supabase.functions.invoke('generate-image', {
                body: {
                    messages: [{ role: 'user', content: prompt }],
                    workspaceId,
                    prompt,
                    style: carouselStyle
                }
            })

            if (data?.error) throw new Error(data.error)
            if (error) throw new Error(error.message)

            const imageUrl = data?.result?.imageUrl
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
            toast({ title: "Generation failed", description: e.message, variant: "destructive" })
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

    const router = useRouter()

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

    // Unsplash Handlers
    const handleImageSourceSelect = (source: 'ai' | 'unsplash') => {
        setSelectedImageSource(source)

        if (source === 'ai') {
            // Continue with AI generation flow
            setFlowState('awaiting_description')
            setMessages(prev => [...prev, {
                role: 'user',
                content: "AI Generate"
            }, {
                role: 'assistant',
                content: "What do you want the image to be about?"
            }])
        } else {
            // Start Unsplash search flow
            setFlowState('awaiting_unsplash_query')
            setMessages(prev => [...prev, {
                role: 'user',
                content: "Search Unsplash"
            }, {
                role: 'assistant',
                content: "What would you like to search for on Unsplash? (e.g., 'coffee shop', 'sunset', 'business meeting')"
            }])
        }
    }

    const handleUnsplashSearch = async (query: string) => {
        if (!workspaceId) {
            toast({ title: "Error", description: "No workspace selected" })
            return
        }

        setIsLoading(true)
        try {
            const { data, error } = await supabase.functions.invoke('search-unsplash', {
                body: { query, count: 4, workspaceId }
            })

            if (error) throw new Error(error.message)
            if (data?.error) throw new Error(data.error)

            const results = data?.result?.data || []
            setUnsplashResults(results)

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Found ${results.length} photos for "${query}"`,
                type: 'unsplash_results',
                data: { results, query }
            }])

            setFlowState('idle')
        } catch (e: any) {
            toast({ title: "Search failed", description: e.message, variant: "destructive" })
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Error searching Unsplash: ${e.message}`
            }])
        } finally {
            setIsLoading(false)
        }
    }

    const handleUnsplashImageSelect = async (photo: any) => {
        if (!workspaceId) {
            toast({ title: "Error", description: "No workspace selected" })
            return
        }

        setSelectedUnsplashId(photo.id)
        setIsLoading(true)

        try {
            const { data, error } = await supabase.functions.invoke('select-unsplash-image', {
                body: {
                    unsplashId: photo.id,
                    downloadLocation: photo.downloadLink,
                    workspaceId,
                    photographer: photo.photographer
                }
            })

            if (error) throw new Error(error.message)
            if (data?.error) throw new Error(data.error)

            const imageUrl = data?.result?.imageUrl
            if (imageUrl) {
                // Add image message
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Selected photo by ${photo.photographer.name}`,
                    type: 'image',
                    data: {
                        id: photo.id,
                        imageUrl,
                        source: 'unsplash',
                        attribution: photo.photographer
                    }
                }])

                toast({ title: "Image selected!", description: "Photo added from Unsplash" })
            }
        } catch (e: any) {
            toast({ title: "Selection failed", description: e.message, variant: "destructive" })
        } finally {
            setIsLoading(false)
            setSelectedUnsplashId(null)
        }
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8.5rem)] max-w-6xl mx-auto w-full bg-background border rounded-2xl overflow-hidden shadow-sm">
            {/* TOOLBAR HEADER - Fixed */}
            <div className="flex-none px-4 py-3 border-b bg-card/50 backdrop-blur-md flex items-center justify-between gap-4 z-10">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Assistant Active</span>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="icon" className="h-8 w-8 bg-background/50 border-muted-foreground/20" title="Chat History">
                                <History className="h-4 w-4 text-muted-foreground" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>Chat History</DialogTitle>
                                <DialogDescription>
                                    Select a previous conversation to resume or start a new chat.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-4 mt-2">
                                <div className="flex justify-end">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        onClick={() => {
                                            loadSession('new')
                                            setActiveFunction("chat-assistant")
                                            toast({ title: "New Chat Started", duration: 1000 })
                                        }}
                                        title="New Chat"
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </div>

                                <ScrollArea className="h-[300px] pr-4">
                                    <div className="space-y-2">
                                        {sessions.map(s => (
                                            <div
                                                key={s.id}
                                                className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${s.id === sessionId ? 'bg-accent border-accent-foreground/20' : 'hover:bg-accent/50 border-transparent'
                                                    }`}
                                            >
                                                <button
                                                    onClick={() => loadSession(s.id)}
                                                    className="flex-1 text-left text-sm truncate px-2"
                                                >
                                                    {s.title || "Untitled Chat"}
                                                </button>

                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                This action cannot be undone. This will permanently delete the chat history.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleDeleteSession(s.id)
                                                                }}
                                                                className="bg-red-500 hover:bg-red-600 focus:ring-red-500"
                                                            >
                                                                Delete
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        ))}
                                        {sessions.length === 0 && (
                                            <div className="text-center py-8 text-muted-foreground text-sm">
                                                No chat history yet.
                                            </div>
                                        )}
                                    </div>
                                </ScrollArea>
                            </div>
                        </DialogContent>
                    </Dialog>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => {
                            loadSession('new')
                            setActiveFunction("chat-assistant")
                            toast({ title: "New Chat Started", duration: 1000 })
                        }}
                        title="New Chat"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                </div>
            </div>

            {/* MESSAGES AREA - Flexible & Scrollable */}
            <div className="flex-1 min-h-0 relative">
                <ScrollArea className="h-full w-full" ref={scrollRef}>
                    <div className="p-4 max-w-4xl mx-auto">
                        {/* EMPTY STATE */}
                        {messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 animate-in fade-in zoom-in duration-500">
                                <div className="text-center space-y-2">
                                    <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">
                                        AI Assistant
                                    </h1>
                                    <p className="text-muted-foreground text-lg">Your social media copilot. Ask me anything!</p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl px-4">
                                    {ACTION_CARDS.map((card, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handleCardClick(card)}
                                            className="flex flex-col items-start p-6 rounded-xl border bg-card hover:bg-accent/50 hover:scale-[1.02] transition-all duration-200 text-left group shadow-sm hover:shadow-md"
                                        >
                                            <div className="p-3 rounded-lg bg-primary/10 text-primary mb-4 group-hover:bg-primary/20 transition-colors">
                                                <card.icon className="w-6 h-6" />
                                            </div>
                                            <h3 className="font-semibold mb-1">{card.title}</h3>
                                            <p className="text-sm text-muted-foreground">{card.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* MESSAGES */}
                        <div className="space-y-6 pb-4 max-w-3xl mx-auto">
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center shrink-0 shadow-lg ring-2 ring-background">
                                            <Bot className="w-4 h-4 text-white" />
                                        </div>
                                    )}

                                    <div className={`flex flex-col gap-2 max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                                        {/* Text Bubble */}
                                        {msg.content && (
                                            <div className={`p-4 rounded-2xl shadow-sm relative group text-sm leading-relaxed
                                        ${msg.role === 'user'
                                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                    : 'bg-muted/50 border border-border rounded-bl-sm'
                                                }`}>
                                                {msg.content}
                                                {msg.role === 'assistant' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="absolute -right-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6"
                                                        onClick={() => handleCopy(msg.content)}
                                                    >
                                                        <Copy className="w-3 h-3 text-muted-foreground" />
                                                    </Button>
                                                )}
                                            </div>
                                        )}

                                        {/* RENDER CONTENT CARDS */}
                                        {msg.type === 'content_cards' && msg.data?.data && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                {msg.data.data.map((card: any, idx: number) => (
                                                    <ContentCard
                                                        key={idx}
                                                        id={card.id || idx.toString()}
                                                        title={card.title}
                                                        body={card.body}
                                                        workspaceId={workspaceId}
                                                        onGenerateImage={handleGenerateImage}
                                                        onRefine={handleRefine}
                                                        onSchedule={handleSchedule}
                                                    />
                                                ))}
                                            </div>
                                        )}

                                        {/* RENDER CAROUSEL PREVIEW */}
                                        {msg.type === 'carousel_slides' && msg.data?.data && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <CarouselPreview
                                                    slots={msg.data.data}
                                                    caption={msg.data.caption}
                                                    onGenerateImage={handleGenerateSlideImage}
                                                    onSchedule={handleSchedule}
                                                    generatingSlide={generatingSlide}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER IMAGE PREVIEW */}
                                        {msg.type === 'image' && msg.data && (
                                            <div className="w-full max-w-sm mt-2 animate-in fade-in zoom-in-50">
                                                <ImagePreview
                                                    id={msg.data.id}
                                                    imageUrl={msg.data.imageUrl}
                                                    promptUsed={msg.data.prompt_used}
                                                    onDownload={handleDownloadImage}
                                                    onUseInPost={handleUseImage}
                                                    onRegenerate={(prompt) => handleSend(`Regenerate: ${prompt}`, "generate-image")}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER STYLE SELECTOR */}
                                        {msg.type === 'style_selector' && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <StyleSelector
                                                    onSelect={handleStyleSelect}
                                                    isGenerating={isLoading && flowState === 'idle'}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER CAROUSEL STYLE SELECTOR */}
                                        {msg.type === 'carousel_style_selector' && msg.data && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <CarouselStyleSelector
                                                    topic={msg.data.topic}
                                                    onGenerate={handleCarouselGenerate}
                                                    isGenerating={isLoading}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER IDEA OPTIONS SELECTOR */}
                                        {msg.type === 'idea_options_selector' && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <IdeaOptionsSelector
                                                    onGenerate={handleIdeaGenerate}
                                                    isLoading={isLoading}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER IMAGE SOURCE SELECTOR */}
                                        {msg.type === 'image_source_selector' && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <ImageSourceSelector
                                                    onSourceSelect={handleImageSourceSelect}
                                                    selectedSource={selectedImageSource || undefined}
                                                />
                                            </div>
                                        )}

                                        {/* RENDER UNSPLASH RESULTS */}
                                        {msg.type === 'unsplash_results' && msg.data?.results && (
                                            <div className="w-full mt-2 animate-in fade-in slide-in-from-bottom-2">
                                                <UnsplashResults
                                                    results={msg.data.results}
                                                    query={msg.data.query}
                                                    onSelect={handleUnsplashImageSelect}
                                                    selectedId={selectedUnsplashId || undefined}
                                                />
                                            </div>
                                        )}

                                    </div>

                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                            <User className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex gap-4">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center animate-pulse">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="p-4 rounded-2xl bg-muted/50 border rounded-bl-sm flex items-center gap-2">
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                        <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </div>

            {/* INPUT AREA - Fixed */}
            <div className="flex-none p-4 border-t bg-background z-20">
                <div className="max-w-3xl mx-auto relative">
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                placeholder={activeFunction !== 'chat-assistant' ? `Using ${activeFunction}...` : "Ask me anything..."}
                                className="pr-12 py-6 rounded-xl shadow-sm border-muted-foreground/20 focus-visible:ring-offset-0 focus-visible:ring-1"
                            />
                            <Button
                                size="icon"
                                className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg bg-primary hover:bg-primary/90 transition-all shadow-sm"
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                            >
                                <ArrowUp className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                    <div className="max-w-3xl mx-auto mt-2 text-center text-xs text-muted-foreground">
                        <p>AI can make mistakes. Check important info.</p>
                    </div>
                </div>
            </div>

            {/* Create Post Modal */}
            <CreatePostModal
                open={isCreatePostModalOpen}
                onOpenChange={(open) => {
                    setIsCreatePostModalOpen(open)
                    if (!open) {
                        // Clear draft when modal closes
                        setDraftCaption("")
                        setDraftMedia([])
                    }
                }}
                workspaceId={workspaceId || ""}
                initialCaption={draftCaption}
                initialMedia={draftMedia}
            />
        </div>
    )
}
