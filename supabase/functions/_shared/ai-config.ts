/**
 * Shared AI configuration resolver for all edge functions.
 * Centralizes API key resolution, model validation, and error handling.
 */

import { decryptSecretIfNeeded } from "./secret-crypto.ts"

// ── Constants ──────────────────────────────────────────────────────────

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash"
export const DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
export const DEFAULT_TEMPERATURE = 0.7
export const DEFAULT_MAX_TOKENS = 2048

/** Models that are deprecated or renamed — auto-upgrade them. */
const GEMINI_MODEL_UPGRADES: Record<string, string> = {
    "gemini-pro": DEFAULT_GEMINI_MODEL,
    "gemini-1.5-flash-latest": "gemini-1.5-flash",
}

// ── Types ──────────────────────────────────────────────────────────────

export interface AIConfig {
    apiKey: string
    modelName: string
    temperature: number
    maxTokens: number
    provider: "gemini" | "openai"
    keySource: "workspace_settings" | "env" | "unknown"
}

export interface ResolveOptions {
    /** Supabase client (service role) */
    supabase: any
    /** Workspace ID to fetch settings for */
    workspaceId: string
    /** Override model name (e.g. from automation node config) */
    modelOverride?: string
    /** Override max tokens */
    maxTokensOverride?: number
    /** If true, use workspace settings for model; if false, prefer overrides */
    useGlobalSettings?: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────

function normalizeApiKey(value: unknown): string {
    return String(value || "").trim().replace(/^['"]|['"]$/g, "")
}

function upgradeModelName(model: string, provider: string): string {
    const trimmed = model.trim()
    if (!trimmed) {
        return provider === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL
    }

    // Cross-provider mismatch: user picked a Gemini model but switched to OpenAI (or vice versa)
    if (provider === "openai" && trimmed.startsWith("gemini")) return DEFAULT_OPENAI_MODEL
    if (provider === "gemini" && trimmed.startsWith("gpt-")) return DEFAULT_GEMINI_MODEL

    // Apply known upgrades for deprecated models
    if (provider === "gemini" && GEMINI_MODEL_UPGRADES[trimmed]) {
        return GEMINI_MODEL_UPGRADES[trimmed]
    }

    return trimmed
}

// ── Main resolver ──────────────────────────────────────────────────────

/**
 * Resolves AI configuration from workspace_settings with env fallback.
 * Throws a clear, user-friendly error if the key is missing or malformed.
 */
export async function resolveAIConfig(opts: ResolveOptions): Promise<AIConfig> {
    const { supabase, workspaceId, modelOverride, maxTokensOverride, useGlobalSettings = true } = opts

    // 1. Fetch workspace settings
    const { data: settings, error: settingsError } = await supabase
        .from("workspace_settings")
        .select("ai_provider, gemini_api_key, openai_api_key, ai_model_name, ai_temperature, ai_max_tokens")
        .eq("workspace_id", workspaceId)
        .maybeSingle()

    if (settingsError) {
        console.error("[ai-config] Failed to fetch workspace_settings:", settingsError)
    }

    const provider = String(settings?.ai_provider || "gemini") as "gemini" | "openai"

    // 2. Resolve API key
    let apiKey = ""
    let keySource: AIConfig["keySource"] = "unknown"

    if (provider === "openai") {
        const dbKey = normalizeApiKey(await decryptSecretIfNeeded(settings?.openai_api_key))
        const envKey = normalizeApiKey(Deno.env.get("OPENAI_API_KEY"))
        apiKey = dbKey || envKey
        keySource = dbKey ? "workspace_settings" : envKey ? "env" : "unknown"
    } else {
        const dbKey = normalizeApiKey(await decryptSecretIfNeeded(settings?.gemini_api_key))
        const envKey = normalizeApiKey(Deno.env.get("GEMINI_API_KEY"))
        apiKey = dbKey || envKey
        keySource = dbKey ? "workspace_settings" : envKey ? "env" : "unknown"
    }

    if (!apiKey) {
        throw new AIConfigError(
            `${provider === "openai" ? "OpenAI" : "Gemini"} API key is not configured. Add it in Settings → AI Provider.`,
            "MISSING_API_KEY",
        )
    }

    // Validate key format
    if (provider === "gemini" && !apiKey.startsWith("AIza")) {
        throw new AIConfigError(
            "Your Gemini API key looks invalid (should start with 'AIza...'). Check Settings → AI Provider.",
            "INVALID_KEY_FORMAT",
        )
    }
    if (provider === "openai" && !apiKey.startsWith("sk-")) {
        throw new AIConfigError(
            "Your OpenAI API key looks invalid (should start with 'sk-...'). Check Settings → AI Provider.",
            "INVALID_KEY_FORMAT",
        )
    }

    // 3. Resolve model name
    const rawModel = useGlobalSettings
        ? (settings?.ai_model_name || "")
        : (modelOverride || settings?.ai_model_name || "")
    const modelName = upgradeModelName(rawModel, provider)

    // 4. Temperature & tokens
    const temperature = Number(settings?.ai_temperature ?? DEFAULT_TEMPERATURE)
    const maxTokens = Number(maxTokensOverride ?? settings?.ai_max_tokens ?? DEFAULT_MAX_TOKENS)

    console.log(`[ai-config] provider=${provider}, model=${modelName}, keySource=${keySource}`)

    return { apiKey, modelName, temperature, maxTokens, provider, keySource }
}

// ── Error helpers ──────────────────────────────────────────────────────

export class AIConfigError extends Error {
    code: string
    constructor(message: string, code: string) {
        super(message)
        this.name = "AIConfigError"
        this.code = code
    }
}

/**
 * Converts any error from the Gemini/OpenAI SDK into a clean, user-friendly message.
 * Strips internal SDK prefixes and raw JSON blobs.
 */
export function toUserFriendlyError(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error)

    // Already a clean AIConfigError
    if (error instanceof AIConfigError) return raw

    // Gemini SDK: [GoogleGenerativeAI Error]: ...
    if (/API_KEY_INVALID|api key not valid/i.test(raw)) {
        return "Your AI API key is invalid or expired. Please update it in Settings → AI Provider."
    }
    if (/PERMISSION_DENIED/i.test(raw)) {
        return "Your AI API key doesn't have permission for this operation. Check your Google Cloud project settings."
    }
    if (/NOT_FOUND|MODEL_NOT_FOUND/i.test(raw)) {
        return "The selected AI model was not found. Try changing the model in Settings → AI Provider."
    }
    if (/RESOURCE_EXHAUSTED|quota/i.test(raw)) {
        return "AI API quota exceeded. Wait a moment or upgrade your API plan."
    }
    if (/SAFETY|blocked|HARM/i.test(raw)) {
        return "Content was blocked by AI safety filters. Try rephrasing your prompt."
    }
    if (/RECITATION/i.test(raw)) {
        return "The AI couldn't generate original content for this prompt. Try a different approach."
    }

    // Strip SDK prefix: [GoogleGenerativeAI Error]: Error fetching from ...
    const cleaned = raw
        .replace(/\[GoogleGenerativeAI Error\]:\s*/i, "")
        .replace(/Error fetching from https:\/\/[^\s:]+:\s*/i, "")
        .replace(/\[\{.*?\}\]/gs, "") // Remove JSON blobs
        .trim()

    return cleaned || "An unexpected AI error occurred. Please try again."
}
