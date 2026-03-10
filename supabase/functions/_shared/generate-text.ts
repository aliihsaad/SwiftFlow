interface GenerateTextParams {
    provider: "gemini" | "openai"
    apiKey: string
    modelName: string
    prompt: string
    systemInstruction?: string
    temperature?: number
    maxTokens?: number
}

function extractOpenAITextContent(content: unknown): string {
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

function normalizeGeneratedText(value: string): string {
    return String(value || "")
        .replace(/^["']|["']$/g, "")
        .replace(/^Reply:\s*/i, "")
        .trim()
}

async function generateWithGemini(params: GenerateTextParams): Promise<string> {
    const { GoogleGenerativeAI } = await import("npm:@google/generative-ai")
    const genAI = new GoogleGenerativeAI(params.apiKey)
    const requestedMaxTokens = Math.max(params.maxTokens ?? 1024, 256)

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const maxOutputTokens = attempt === 0
            ? requestedMaxTokens
            : Math.min(requestedMaxTokens * 2, 2048)

        const model = genAI.getGenerativeModel({
            model: params.modelName,
            ...(params.systemInstruction ? { systemInstruction: params.systemInstruction } : {}),
            generationConfig: {
                temperature: params.temperature ?? 0.7,
                maxOutputTokens,
            },
        })

        const result = await model.generateContent(params.prompt)
        const response = result.response
        const text = response.text?.() || ""

        if (text.trim()) return text

        const finishReasons = Array.isArray(response?.candidates)
            ? response.candidates.map((candidate: { finishReason?: string }) => candidate?.finishReason).filter(Boolean)
            : []
        const blockReason = response?.promptFeedback?.blockReason

        if (blockReason) {
            throw new Error(`The AI returned no text (${blockReason}). Try rephrasing the prompt.`)
        }

        const hitMaxTokens = finishReasons.includes("MAX_TOKENS")
        if (hitMaxTokens && attempt === 0 && maxOutputTokens < 2048) {
            continue
        }

        if (finishReasons.length > 0) {
            throw new Error(`The AI returned no text (${finishReasons.join(", ")}). Try again.`)
        }
    }

    return ""
}

async function generateWithOpenAI(params: GenerateTextParams): Promise<string> {
    const messages = []

    if (params.systemInstruction?.trim()) {
        messages.push({ role: "system", content: params.systemInstruction.trim() })
    }

    messages.push({ role: "user", content: params.prompt })

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${params.apiKey}`,
        },
        body: JSON.stringify({
            model: params.modelName,
            messages,
            temperature: params.temperature ?? 0.7,
            max_tokens: params.maxTokens ?? 1024,
        }),
    })

    const data = await response.json()

    if (!response.ok || data?.error) {
        throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`)
    }

    return extractOpenAITextContent(data?.choices?.[0]?.message?.content)
}

export async function generateText(params: GenerateTextParams): Promise<string> {
    if (params.provider === "openai") {
        return generateWithOpenAI(params)
    }

    return generateWithGemini(params)
}

export function requireGeneratedText(value: string, label = "AI reply"): string {
    const normalized = normalizeGeneratedText(value)

    if (!normalized) {
        throw new Error(`${label} was empty. Try again or check your AI provider settings.`)
    }

    return normalized
}
