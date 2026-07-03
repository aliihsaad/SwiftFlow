"use client"

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react"
import { Bot, Loader2, Send, X } from "lucide-react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { shouldHideFloatingAssistant } from "@/lib/assistant/floating-visibility"
import { cn } from "@/lib/utils"

type FloatingAssistantMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const MAX_HISTORY_MESSAGES = 12

function createMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readAssistantText(payload: unknown): string {
  const response = payload && typeof payload === "object"
    ? payload as { data?: unknown; response?: unknown; message?: unknown }
    : {}
  const data = response.data

  if (typeof data === "string") return data
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>
    for (const key of ["response", "message", "text", "content"]) {
      if (typeof record[key] === "string" && record[key].trim()) return record[key]
    }
    if (record.result && typeof record.result === "object") {
      const result = record.result as Record<string, unknown>
      for (const key of ["response", "message", "text", "content"]) {
        if (typeof result[key] === "string" && result[key].trim()) return result[key]
      }
    }
  }

  if (typeof response.response === "string") return response.response
  if (typeof response.message === "string") return response.message

  return "I could not read that response."
}

function readErrorText(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    if (typeof record.error === "string" && record.error.trim()) return record.error
    if (record.error && typeof record.error === "object") {
      const error = record.error as Record<string, unknown>
      if (typeof error.message === "string" && error.message.trim()) return error.message
    }
  }

  return fallback
}

export function FloatingAssistant({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<FloatingAssistantMessage[]>([])
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ block: "end" })
  }, [messages, isLoading])

  if (shouldHideFloatingAssistant(pathname)) return null

  const submitMessage = async (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMessage: FloatingAssistantMessage = {
      id: createMessageId(),
      role: "user",
      content: trimmed,
    }
    const nextMessages = [...messages, userMessage].slice(-MAX_HISTORY_MESSAGES)
    setMessages(nextMessages)
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/assistant/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surface: "floating_readonly",
          message: trimmed,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          mode: "ask",
          functionName: "chat-assistant",
          workspaceId,
        }),
      })
      const payload = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(readErrorText(payload, "Assistant request failed"))
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant" as const,
          content: readAssistantText(payload),
        },
      ].slice(-MAX_HISTORY_MESSAGES))
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant" as const,
          content: error instanceof Error ? error.message : "Assistant request failed",
        },
      ].slice(-MAX_HISTORY_MESSAGES))
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void submitMessage()
    }
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="fixed bottom-14 right-4 z-40 sm:bottom-16 sm:right-6">
        {isOpen ? (
          <section
            aria-label="Floating AI assistant"
            className="mb-3 flex h-[min(560px,calc(100vh-7rem))] w-[calc(100vw-2rem)] max-w-[380px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12131d]/95 text-white/85 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl"
          >
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-white/90">AI assistant</h2>
                  <p className="truncate text-[11px] text-white/40">Read-only workspace help</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close floating assistant"
                className="h-8 w-8 text-white/55 hover:bg-white/5 hover:text-white/85"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <ScrollArea className="min-h-0 flex-1 px-3 py-3">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/60">
                    Ask about this workspace, recent posts, accounts, automations, or cached analytics.
                  </div>
                ) : null}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-5",
                      message.role === "user"
                        ? "ml-auto bg-cyan-400/15 text-cyan-50"
                        : "mr-auto border border-white/10 bg-white/5 text-white/75",
                    )}
                  >
                    {message.content}
                  </div>
                ))}
                {isLoading ? (
                  <div className="mr-auto flex max-w-[88%] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Thinking
                  </div>
                ) : null}
                <div ref={scrollAnchorRef} />
              </div>
            </ScrollArea>

            <form onSubmit={submitMessage} className="flex shrink-0 items-end gap-2 border-t border-white/10 p-3">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a question..."
                rows={1}
                className="max-h-28 min-h-10 resize-none border-white/10 bg-[#1b1d28] text-sm text-white/85 placeholder:text-white/25 focus-visible:border-cyan-300/25 focus-visible:ring-cyan-400/25"
                disabled={isLoading}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={isLoading || !input.trim()}
                className="h-10 w-10 shrink-0 border border-cyan-300/20 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/20"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </section>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              aria-label="Open floating AI assistant"
              className="h-12 w-12 rounded-full border border-cyan-300/25 bg-gradient-to-br from-cyan-400/25 via-violet-400/25 to-amber-300/20 text-white shadow-[0_14px_42px_rgba(0,0,0,0.38)] hover:from-cyan-400/35 hover:to-amber-300/25"
              onClick={() => setIsOpen((value) => !value)}
            >
              <Bot className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="border-white/10 bg-[#1b1d28] text-white/80">
            Floating AI assistant
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
