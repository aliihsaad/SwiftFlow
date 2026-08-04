const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const META_GRAPH_NODE_ID_RE = /^[0-9_]{3,128}$/
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const ALLOWED_BRAND_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ko', 'hi', 'ru', 'tr'] as const
const ALLOWED_AI_PROVIDERS = ['openrouter', 'gemini', 'openai'] as const

type JsonObject = Record<string, unknown>
type AssistantFunctionName = 'generate-reply' | 'generate-message-reply'
const MAX_ATTACHMENT_HISTORY = 25
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
function isPlainObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, maxLength)
}

function clampNullableString(value: unknown, maxLength: number): string | null {
    const clamped = clampString(value, maxLength)
    return clamped || null
}

function sanitizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
        .map((item) => item.slice(0, maxLength))
}

function sanitizeHttpUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    if (!trimmed) return null

    try {
        const url = new URL(trimmed)
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
        return url.toString().slice(0, 2048)
    } catch {
        return null
    }
}

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function isMetaGraphNodeId(value: unknown): value is string {
    return typeof value === 'string' && META_GRAPH_NODE_ID_RE.test(value.trim())
}

export function assertUuid(value: unknown, fieldName: string): string {
    if (!isUuid(value)) {
        throw new Error(`Invalid ${fieldName}`)
    }
    return value.trim()
}

export function assertMetaGraphNodeId(value: unknown, fieldName: string): string {
    if (!isMetaGraphNodeId(value)) {
        throw new Error(`Invalid ${fieldName}`)
    }
    return value.trim()
}

function sanitizeConversationHistory(
    value: unknown,
): Array<{ message: string | null; is_from_page: boolean }> {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            message: clampNullableString(item.message, 4_000),
            is_from_page: item.is_from_page === true,
        }))
        .slice(0, MAX_ATTACHMENT_HISTORY)
}

export class RequestBodyTooLargeError extends Error {
    constructor() {
        super('Request payload too large')
        this.name = 'RequestBodyTooLargeError'
    }
}

/**
 * Read a request body into memory with a hard byte cap enforced while streaming.
 * Use for unauthenticated/signed-payload endpoints (webhooks) where the body must be
 * buffered before verification and Content-Length cannot be trusted.
 */
export async function readRawBodyWithLimit(request: Request, maxBytes: number): Promise<Uint8Array> {
    const declaredLength = Number(request.headers.get('content-length') || '0')
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new RequestBodyTooLargeError()
    }

    if (!request.body) return new Uint8Array(0)

    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
            await reader.cancel()
            throw new RequestBodyTooLargeError()
        }
        chunks.push(value)
    }

    const combined = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.byteLength
    }
    return combined
}

export function assertJsonBodySize(request: Request, maxBytes = MAX_JSON_BODY_BYTES) {
    const rawLength = request.headers.get('content-length')
    if (!rawLength) return

    const bytes = Number(rawLength)
    if (!Number.isFinite(bytes) || bytes < 0) {
        throw new Error('Invalid content length')
    }
    if (bytes > maxBytes) {
        throw new Error('Request payload too large')
    }
}

export function sanitizeAssistantInvokePayload(
    functionName: AssistantFunctionName,
    body: unknown,
): Record<string, unknown> {
    if (!isPlainObject(body)) {
        throw new Error('Invalid assistant payload')
    }

    const workspaceId = body.workspaceId != null ? assertUuid(body.workspaceId, 'workspaceId') : undefined

    switch (functionName) {
        case 'generate-reply':
            return {
                workspaceId,
                comment: clampString(body.comment, 4_000),
                authorUsername: clampNullableString(body.authorUsername, 120),
                postContent: clampNullableString(body.postContent, 4_000),
                platform: clampString(body.platform, 32) || 'instagram',
            }
        case 'generate-message-reply':
            return {
                workspaceId,
                message: clampString(body.message, 4_000),
                participantUsername: clampNullableString(body.participantUsername, 120),
                conversationHistory: sanitizeConversationHistory(body.conversationHistory),
                platform: clampString(body.platform, 32) || 'instagram',
            }
        default:
            return { workspaceId }
    }
}

type ServiceEntry = { name: string; description: string }

function sanitizeServices(value: unknown): ServiceEntry[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string | JsonObject => typeof item === 'string' || isPlainObject(item))
        .map((item) => ({
            name: typeof item === 'string' ? clampString(item, 120) : clampString(item.name, 120),
            description: typeof item === 'string' ? '' : clampString(item.description, 500),
        }))
        .filter((item) => item.name.length > 0)
        .slice(0, 25)
}

function sanitizeBrandVoice(value: unknown, fallback = ''): string {
    const voice = clampString(value, 2000)
    return voice || fallback
}

export function sanitizeBrandProfilePayload(body: unknown) {
    if (!isPlainObject(body)) {
        throw new Error('Invalid brand profile payload')
    }

    const rawColors = isPlainObject(body.brand_colors) ? body.brand_colors : {}
    const primary = typeof rawColors.primary === 'string' && HEX_COLOR_RE.test(rawColors.primary.trim())
        ? rawColors.primary.trim()
        : '#000000'
    const secondary = typeof rawColors.secondary === 'string' && HEX_COLOR_RE.test(rawColors.secondary.trim())
        ? rawColors.secondary.trim()
        : '#666666'
    const accent = typeof rawColors.accent === 'string' && HEX_COLOR_RE.test(rawColors.accent.trim())
        ? rawColors.accent.trim()
        : '#0066CC'

    return {
        business_name: clampString(body.business_name, 160),
        owner_name: clampString(body.owner_name, 120),
        email: clampString(body.email, 160),
        phone: clampString(body.phone, 60),
        website: sanitizeHttpUrl(body.website) || '',
        industry: clampString(body.industry, 120),
        business_description: clampString(body.business_description, 2000),
        target_audience: clampString(body.target_audience, 1200),
        brand_voice: sanitizeBrandVoice(body.brand_voice, 'professional'),
        language: typeof body.language === 'string' && (ALLOWED_BRAND_LANGUAGES as readonly string[]).includes(body.language)
            ? body.language
            : 'en',
        services: sanitizeServices(body.services),
        unique_selling_points: sanitizeStringArray(body.unique_selling_points, 25, 200),
        logo_url: sanitizeHttpUrl(body.logo_url) || '',
        brand_colors: {
            enabled: rawColors.enabled !== false,
            primary,
            secondary,
            accent,
        },
        reference_image_urls: (Array.isArray(body.reference_image_urls) ? body.reference_image_urls : [])
            .map((value) => sanitizeHttpUrl(value))
            .filter((value): value is string => Boolean(value))
            .slice(0, 20),
        instagram_handle: clampString(body.instagram_handle, 120),
        content_themes: sanitizeStringArray(body.content_themes, 25, 120),
    }
}

export function sanitizePartialBrandProfilePayload(body: unknown) {
    if (!isPlainObject(body)) {
        throw new Error('Invalid brand profile payload')
    }

    const payload: Record<string, unknown> = {}
    if ('business_name' in body) payload.business_name = clampString(body.business_name, 160)
    if ('owner_name' in body) payload.owner_name = clampString(body.owner_name, 120)
    if ('email' in body) payload.email = clampString(body.email, 160)
    if ('phone' in body) payload.phone = clampString(body.phone, 60)
    if ('website' in body) payload.website = sanitizeHttpUrl(body.website) || ''
    if ('industry' in body) payload.industry = clampString(body.industry, 120)
    if ('business_description' in body) payload.business_description = clampString(body.business_description, 2000)
    if ('target_audience' in body) payload.target_audience = clampString(body.target_audience, 1200)
    if ('brand_voice' in body) {
        payload.brand_voice = sanitizeBrandVoice(body.brand_voice)
    }
    if ('language' in body) {
        payload.language = typeof body.language === 'string' && (ALLOWED_BRAND_LANGUAGES as readonly string[]).includes(body.language)
            ? body.language
            : 'en'
    }
    if ('services' in body) payload.services = sanitizeServices(body.services)
    if ('unique_selling_points' in body) payload.unique_selling_points = sanitizeStringArray(body.unique_selling_points, 25, 200)
    if ('logo_url' in body) payload.logo_url = sanitizeHttpUrl(body.logo_url) || ''
    if ('brand_colors' in body) {
        const rawColors = isPlainObject(body.brand_colors) ? body.brand_colors : {}
        const colors: Record<string, unknown> = {}
        if ('enabled' in rawColors) colors.enabled = rawColors.enabled !== false
        if (typeof rawColors.primary === 'string' && HEX_COLOR_RE.test(rawColors.primary.trim())) {
            colors.primary = rawColors.primary.trim()
        }
        if (typeof rawColors.secondary === 'string' && HEX_COLOR_RE.test(rawColors.secondary.trim())) {
            colors.secondary = rawColors.secondary.trim()
        }
        if (typeof rawColors.accent === 'string' && HEX_COLOR_RE.test(rawColors.accent.trim())) {
            colors.accent = rawColors.accent.trim()
        }
        payload.brand_colors = colors
    }
    if ('reference_image_urls' in body) {
        payload.reference_image_urls = (Array.isArray(body.reference_image_urls) ? body.reference_image_urls : [])
            .map((value) => sanitizeHttpUrl(value))
            .filter((value): value is string => Boolean(value))
            .slice(0, 20)
    }
    if ('instagram_handle' in body) payload.instagram_handle = clampString(body.instagram_handle, 120)
    if ('content_themes' in body) payload.content_themes = sanitizeStringArray(body.content_themes, 25, 120)

    return payload
}

export function sanitizeWorkspaceSettingsPayload(body: unknown): {
    workspaceId: string
    settings: Record<string, unknown>
} {
    if (!isPlainObject(body)) {
        throw new Error('Invalid workspace settings payload')
    }

    const workspaceId = assertUuid(body.workspaceId, 'workspaceId')
    const settings: Record<string, unknown> = {}

    if (typeof body.ai_provider === 'string' && (ALLOWED_AI_PROVIDERS as readonly string[]).includes(body.ai_provider)) {
        settings.ai_provider = body.ai_provider
    }
    if ('openrouter_api_key' in body) settings.openrouter_api_key = clampString(body.openrouter_api_key, 500)
    if ('gemini_api_key' in body) settings.gemini_api_key = clampString(body.gemini_api_key, 500)
    if ('openai_api_key' in body) settings.openai_api_key = clampString(body.openai_api_key, 500)
    if ('ai_text_model_name' in body) settings.ai_text_model_name = clampString(body.ai_text_model_name, 160)
    if ('ai_model_name' in body) settings.ai_model_name = clampString(body.ai_model_name, 160)
    if ('timezone' in body) settings.timezone = clampString(body.timezone, 80)
    if ('default_language' in body) settings.default_language = clampString(body.default_language, 16)
    if (typeof body.ai_temperature === 'number' && Number.isFinite(body.ai_temperature)) {
        settings.ai_temperature = Math.min(2, Math.max(0, body.ai_temperature))
    }
    if (typeof body.ai_max_tokens === 'number' && Number.isFinite(body.ai_max_tokens)) {
        settings.ai_max_tokens = Math.min(8192, Math.max(256, Math.round(body.ai_max_tokens)))
    }

    return { workspaceId, settings }
}
