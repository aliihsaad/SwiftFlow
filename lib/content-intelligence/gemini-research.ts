import type { ProviderResearchFinding, ResearchProviderAdapter, ResearchRequest } from "./research"

/**
 * Live Gemini research adapter with Google Search grounding.
 *
 * Uses the workspace's own Gemini key (BYOK) resolved by the caller. Any
 * failure — timeout, quota, invalid model output — throws, and the research
 * pipeline falls back to benchmark guidance instead of surfacing an error.
 */

export const GEMINI_RESEARCH_TIMEOUT_MS = 15_000
export const GEMINI_RESEARCH_DEFAULT_MODEL = "gemini-2.5-flash"

/** Runs a grounded generation and returns the raw model text. Injectable for tests. */
export type GroundedSearchRunner = (prompt: string) => Promise<string>

export interface GeminiResearchAdapterOptions {
  apiKey: string | null | undefined
  model?: string
  timeoutMs?: number
  runSearch?: GroundedSearchRunner
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("gemini_research_timeout")), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function buildResearchPrompt(request: ResearchRequest): string {
  const platform = request.platform && request.platform !== "all" ? request.platform : "Instagram"
  return `Use Google Search to research current trends, news, and high-performing content angles about "${request.topic}" for ${platform} content creators.

Return ONLY a JSON array (no markdown fences, no commentary) with 4 to 8 findings:
[{"title": "...", "summary": "...", "url": "https://...", "publishedAt": "YYYY-MM-DD"}]

Rules:
- Every finding must be based on actual search results. Never invent facts, statistics, or sources.
- "url" must be the real source page found via search. Omit the field if you are not certain of the exact URL.
- "publishedAt" is the source publication date when known; omit when unknown.
- "summary" is at most 50 words, concrete and directly usable for content planning.`
}

function asValidHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined
  } catch {
    return undefined
  }
}

function asValidPublishedAt(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined
}

/**
 * Strict validation of the model output: anything that does not parse into a
 * non-empty list of {title, summary} findings throws, which triggers the
 * benchmark fallback upstream.
 */
export function parseGeminiResearchFindings(rawText: string): ProviderResearchFinding[] {
  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim()
  const start = cleaned.indexOf("[")
  const end = cleaned.lastIndexOf("]")
  if (start === -1 || end <= start) {
    throw new Error("gemini_research_invalid_output")
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    throw new Error("gemini_research_invalid_output")
  }
  if (!Array.isArray(parsed)) {
    throw new Error("gemini_research_invalid_output")
  }

  const findings: ProviderResearchFinding[] = []
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue
    const record = item as Record<string, unknown>
    const title = typeof record.title === "string" ? record.title.trim().slice(0, 200) : ""
    const summary = typeof record.summary === "string" ? record.summary.trim().slice(0, 600) : ""
    if (!title || !summary) continue

    findings.push({
      title,
      summary,
      url: asValidHttpUrl(record.url),
      publishedAt: asValidPublishedAt(record.publishedAt),
      provider: "gemini",
    })
  }

  if (findings.length === 0) {
    throw new Error("gemini_research_invalid_output")
  }
  return findings.slice(0, 8)
}

function createDefaultRunner(apiKey: string, model: string, timeoutMs: number): GroundedSearchRunner {
  return async (prompt: string) => {
    const { GoogleGenerativeAI } = await import("@google/generative-ai")
    const genAI = new GoogleGenerativeAI(apiKey)
    const generativeModel = genAI.getGenerativeModel(
      {
        model,
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
        tools: [{ googleSearch: {} } as never],
      },
      { timeout: timeoutMs },
    )
    const result = await generativeModel.generateContent(prompt)
    return result.response.text()
  }
}

export function createGeminiResearchAdapter(options: GeminiResearchAdapterOptions): ResearchProviderAdapter {
  const apiKey = String(options.apiKey || "").trim()
  const model = (options.model || GEMINI_RESEARCH_DEFAULT_MODEL).trim() || GEMINI_RESEARCH_DEFAULT_MODEL
  const timeoutMs = options.timeoutMs ?? GEMINI_RESEARCH_TIMEOUT_MS

  return {
    id: "gemini",
    label: "Gemini grounded research",
    isConfigured: () => apiKey.length > 0 || Boolean(options.runSearch),
    search: async (request) => {
      const runner = options.runSearch || createDefaultRunner(apiKey, model, timeoutMs)
      const rawText = await withTimeout(runner(buildResearchPrompt(request)), timeoutMs)
      return parseGeminiResearchFindings(rawText)
    },
  }
}
