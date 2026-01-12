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
    RefreshCw
} from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { useToast } from "@/components/ui/use-toast"
import { ContentCard } from "./components/content-card"
import { CarouselPreview } from "./components/carousel-preview"
import { ImagePreview } from "./components/image-preview"

interface Message {
    role: 'user' | 'assistant'
    content: string
    type?: 'text' | 'content_cards' | 'carousel_slides' | 'image'
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
        icon: LinkIcon,
        title: "Turn a link into posts",
        description: "Transform any URL into social content",
        prompt: "Turn this link into a LinkedIn post: ",
        functionName: "repurpose-link"
    },
    {
        icon: ImageIcon,
        title: "Create an image",
        description: "Generate AI images for posts",
        prompt: "Create a realistic image of...",
        functionName: "generate-image"
    },
    {
        icon: CalendarDays,
        title: "View my schedule",
        description: "See upcoming scheduled posts",
        prompt: "What posts do I have scheduled for this week?",
        functionName: "get-schedule"
    },
    {
        icon: BarChart3,
        title: "View my analytics",
        description: "Quick stats across all platforms",
        prompt: "Summarize my engagement stats for the last month.",
        functionName: "get-analytics"
    }
]

export function ChatInterface({ workspaceId }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [activeFunction, setActiveFunction] = useState<string>("chat-assistant")
    const { toast } = useToast()
    const supabase = createClient()
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isLoading])

    const handleSend = async (text?: string, overrideFunction?: string) => {
        const messageText = text || input
        if (!messageText.trim()) return

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

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: responseContent,
                type: responseType,
                data: responseData
            }])

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

    const handleCardClick = (card: typeof ACTION_CARDS[0]) => {
        setActiveFunction(card.functionName)
        if (card.prompt.endsWith("...") || card.prompt.endsWith(": ")) {
            setInput(card.prompt)
        } else {
            handleSend(card.prompt, card.functionName)
        }
    }

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text)
        toast({ title: "Copied!", duration: 1000 })
    }

    // Handlers for Content Card Actions
    const handleGenerateImage = (id: string, text: string) => {
        // Trigger image generation based on content
        handleSend(`Generate an image for this post: "${text.substring(0, 100)}..."`, "generate-image")
    }

    const handleRefine = (id: string, text: string) => {
        setInput(`Refine this post: "${text.substring(0, 50)}..." Make it shorter.`)
    }

    const handleSchedule = (id: string, text: string, image?: string) => {
        // Store draft data
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('draft_post_caption', text)
            if (image) {
                sessionStorage.setItem('draft_post_media', JSON.stringify([image]))
            }
        }

        toast({ title: "Opening Scheduler...", description: "Draft created from idea." })
        router.push('/dashboard/create')
    }

    const router = useRouter()

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
        // Store in session storage to pass to the Create Post page
        // We use session storage because Data URLs are too large for URL params
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('draft_post_media', JSON.stringify([url]))
            sessionStorage.setItem('draft_post_caption', messages[messages.length - 1]?.content || '') // Try to capture context
        }

        toast({ title: "Opening Editor...", description: "Image attached to new post draft." })
        router.push('/dashboard/create')
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-5xl mx-auto w-full bg-background">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
                                        <CarouselPreview slots={msg.data.data} />
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
            </ScrollArea>

            {/* INPUT AREA */}
            <div className="p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div className="max-w-3xl mx-auto relative flex gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                            setMessages([])
                            setActiveFunction("chat-assistant")
                            toast({ title: "Chat Cleared", duration: 1000 })
                        }}
                        title="New Chat"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </Button>
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
    )
}
