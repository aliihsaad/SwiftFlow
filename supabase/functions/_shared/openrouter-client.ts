export type OpenRouterContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant"
  content: string | OpenRouterContentPart[]
}

export interface OpenRouterChatOptions {
  apiKey: string
  modelName: string
  messages: OpenRouterMessage[]
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: "json_object" } | { type: "json_schema"; json_schema: Record<string, unknown> }
  plugins?: Array<Record<string, unknown>>
}

export function extractOpenRouterTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "type" in part && (part as { type?: string }).type === "text") {
        return String((part as { text?: string }).text || "")
      }
      return ""
    })
    .join("")
}

export async function createOpenRouterChatCompletion(options: OpenRouterChatOptions): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.modelName,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
      ...(options.plugins?.length ? { plugins: options.plugins } : {}),
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `OpenRouter request failed (${response.status})`)
  }

  return extractOpenRouterTextContent(data?.choices?.[0]?.message?.content)
}
