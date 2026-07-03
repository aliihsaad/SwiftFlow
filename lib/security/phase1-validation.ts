import type { AICaptionRequest, Platform, PostStatus } from '@/types/post'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const META_ACCOUNT_ID_RE = /^[0-9]{3,32}$/
const META_GRAPH_NODE_ID_RE = /^[0-9_]{3,128}$/
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const ALLOWED_PLATFORMS: Platform[] = ['instagram', 'facebook']
const ALLOWED_STATUSES: PostStatus[] = ['draft', 'scheduled', 'publishing', 'published', 'failed']
const ALLOWED_TONES = ['educational', 'funny', 'professional', 'engaging'] as const
const ALLOWED_BRAND_LANGUAGES = ['en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ar', 'zh', 'ja', 'ko', 'hi', 'ru', 'tr'] as const
const ALLOWED_AI_PROVIDERS = ['openrouter', 'gemini', 'openai'] as const

type JsonObject = Record<string, unknown>
type AssistantFunctionName =
    | 'chat-assistant'
    | 'generate-image'
    | 'generate-ideas'
    | 'generate-carousel'
    | 'generate-reply'
    | 'generate-message-reply'

type AssistantImage = { base64: string; mimeType: string; name?: string }
type AssistantMessage = { role: 'user' | 'assistant'; content: string; images?: AssistantImage[] }
type MetaGranularScope = { scope: string; target_ids?: string[] }
type SanitizedMetaPageData = {
    id: string
    name: string
    category: string
    access_token: string
    ig_account_id: string | null
    ig_username: string | null
    granted_scopes: string[]
    granted_granular_scopes: MetaGranularScope[]
    /** ISO expiry of the page token; null means the token does not expire. */
    token_expires_at: string | null
}

const MAX_MESSAGES = 40
const MAX_MESSAGE_LENGTH = 8_000
const MAX_BASE64_LENGTH = 4_000_000
const MAX_REFERENCE_IMAGES = 4
const MAX_ATTACHMENT_HISTORY = 25
const MAX_JSON_BODY_BYTES = 5 * 1024 * 1024
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_JSON_DEPTH = 6
const MAX_JSON_ARRAY_ITEMS = 100
const MAX_JSON_OBJECT_KEYS = 50

function isPlainObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return ''
    return value.trim().slice(0, maxLength)
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

function isPrivateIpv4Host(hostname: string): boolean {
    const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!match) return false

    const octets = match.slice(1).map((part) => Number(part))
    if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) return true

    return (
        octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
        (octets[0] === 192 && octets[1] === 168)
    )
}

function isBlockedHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase()
    if (!normalized) return true

    return (
        normalized === 'localhost' ||
        normalized === '0.0.0.0' ||
        normalized === '::1' ||
        normalized.endsWith('.localhost') ||
        normalized.endsWith('.local') ||
        normalized.endsWith('.internal') ||
        normalized.endsWith('.lan') ||
        normalized.endsWith('.home') ||
        normalized.endsWith('.test') ||
        normalized.endsWith('.invalid') ||
        isPrivateIpv4Host(normalized)
    )
}

function sanitizePublicMediaUrl(value: unknown): string | null {
    const sanitized = sanitizeHttpUrl(value)
    if (!sanitized) return null

    try {
        const url = new URL(sanitized)
        if (url.username || url.password) return null
        if (isBlockedHostname(url.hostname)) return null
        return url.toString().slice(0, 2048)
    } catch {
        return null
    }
}

export function isUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_RE.test(value.trim())
}

export function isMetaAccountId(value: unknown): value is string {
    return typeof value === 'string' && META_ACCOUNT_ID_RE.test(value.trim())
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

export function sanitizePlatformList(value: unknown): Platform[] {
    if (!Array.isArray(value)) return []
    return Array.from(new Set(
        value.filter((item): item is Platform => typeof item === 'string' && ALLOWED_PLATFORMS.includes(item as Platform))
    ))
}

function sanitizeBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined
}

function clampNullableString(value: unknown, maxLength: number): string | null {
    const normalized = clampString(value, maxLength)
    return normalized || null
}

function sanitizeAssistantImages(value: unknown): AssistantImage[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            base64: clampString(item.base64, MAX_BASE64_LENGTH),
            mimeType: clampString(item.mimeType, 80).toLowerCase(),
            name: clampString(item.name, 160) || undefined,
        }))
        .filter((item) => item.base64.length > 0 && SUPPORTED_IMAGE_MIME_TYPES.has(item.mimeType))
        .slice(0, MAX_REFERENCE_IMAGES)
}

function sanitizeAssistantMessages(value: unknown): AssistantMessage[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            role: (item.role === 'assistant' ? 'assistant' : 'user') as AssistantMessage['role'],
            content: clampString(item.content, MAX_MESSAGE_LENGTH),
            images: sanitizeAssistantImages(item.images),
        }))
        .filter((item) => item.content.length > 0 || (item.images && item.images.length > 0))
        .slice(0, MAX_MESSAGES)
}

function sanitizeReferenceImages(value: unknown): Array<{ base64: string; mimeType: string }> {
    return sanitizeAssistantImages(value).map(({ base64, mimeType }) => ({ base64, mimeType }))
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

function sanitizeGranularScopes(value: unknown): MetaGranularScope[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            scope: clampString(item.scope, 120),
            target_ids: Array.isArray(item.target_ids)
                ? item.target_ids
                    .filter((targetId): targetId is string => isMetaAccountId(targetId))
                    .slice(0, 20)
                : undefined,
        }))
        .filter((item) => item.scope.length > 0)
        .slice(0, 50)
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
    if (depth > MAX_JSON_DEPTH) return null
    if (value == null) return null
    if (typeof value === 'string') return value.slice(0, MAX_MESSAGE_LENGTH)
    if (typeof value === 'number') return Number.isFinite(value) ? value : null
    if (typeof value === 'boolean') return value

    if (Array.isArray(value)) {
        return value
            .slice(0, MAX_JSON_ARRAY_ITEMS)
            .map((item) => sanitizeJsonValue(item, depth + 1))
    }

    if (isPlainObject(value)) {
        const output: Record<string, unknown> = {}
        for (const [key, entryValue] of Object.entries(value).slice(0, MAX_JSON_OBJECT_KEYS)) {
            if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue
            output[key] = sanitizeJsonValue(entryValue, depth + 1)
        }
        return output
    }

    return null
}

function sanitizeChatSessionMessages(value: unknown) {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            role: (item.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
            content: clampString(item.content, MAX_MESSAGE_LENGTH),
            type: clampString(item.type, 80) || undefined,
            data: sanitizeJsonValue(item.data),
        }))
        .filter((item) => item.content.length > 0 || item.data != null)
        .slice(0, MAX_MESSAGES)
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

export function sanitizeMetaPageSessionId(value: unknown): string {
    return assertUuid(value, 'sessionId')
}

export function sanitizeMetaSelectPagePayload(body: unknown): { sessionId: string; selectedPageId: string } {
    if (!isPlainObject(body)) {
        throw new Error('Invalid page selection payload')
    }

    const sessionId = sanitizeMetaPageSessionId(body.sessionId)
    if (!isMetaAccountId(body.selectedPageId)) {
        throw new Error('Invalid selectedPageId')
    }

    return {
        sessionId,
        selectedPageId: body.selectedPageId.trim(),
    }
}

function sanitizeNullableIsoDate(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export function sanitizeMetaPageSessionData(value: unknown): SanitizedMetaPageData[] {
    if (!Array.isArray(value)) return []

    return value
        .filter((item): item is JsonObject => isPlainObject(item))
        .map((item) => ({
            id: isMetaAccountId(item.id) ? item.id.trim() : '',
            name: clampString(item.name, 200),
            category: clampString(item.category, 160),
            access_token: clampString(item.access_token, 4_000),
            ig_account_id: isMetaAccountId(item.ig_account_id) ? item.ig_account_id.trim() : null,
            ig_username: clampNullableString(item.ig_username, 120),
            granted_scopes: sanitizeStringArray(item.granted_scopes, 100, 120),
            granted_granular_scopes: sanitizeGranularScopes(item.granted_granular_scopes),
            token_expires_at: sanitizeNullableIsoDate(item.token_expires_at),
        }))
        .filter((item) => item.id.length > 0 && item.name.length > 0)
        .slice(0, 50)
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
        case 'chat-assistant':
            return {
                messages: sanitizeAssistantMessages(body.messages),
                workspaceId,
            }
        case 'generate-ideas':
        case 'generate-carousel':
            return {
                messages: sanitizeAssistantMessages(body.messages),
                workspaceId,
                research: sanitizeBoolean(body.research),
                researchQuery: clampString(body.researchQuery, 500) || undefined,
            }
        case 'generate-image':
            return {
                messages: sanitizeAssistantMessages(body.messages),
                workspaceId,
                prompt: clampString(body.prompt, 4_000) || undefined,
                style: clampString(body.style, 120) || undefined,
                referenceImages: sanitizeReferenceImages(body.referenceImages),
                referenceMode: clampString(body.referenceMode, 80) || undefined,
                brandImageMode: clampString(body.brandImageMode, 80) || undefined,
                transformAction: clampString(body.transformAction, 80) || undefined,
            }
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

export function sanitizePostStatus(value: unknown): PostStatus | null {
    return typeof value === 'string' && ALLOWED_STATUSES.includes(value as PostStatus)
        ? value as PostStatus
        : null
}

export function sanitizePostPayload(body: unknown): {
    id?: string
    platforms: Platform[]
    captionByPlatform: { instagram?: string; facebook?: string }
    mediaUrls: string[]
    status: PostStatus
    scheduledAt?: string | null
} {
    if (!isPlainObject(body)) {
        throw new Error('Invalid post payload')
    }

    const platforms = sanitizePlatformList(body.platforms)
    const status = sanitizePostStatus(body.status)
    if (platforms.length === 0) {
        throw new Error('At least one valid platform is required')
    }
    if (!status) {
        throw new Error('Invalid post status')
    }

    const captionObj = isPlainObject(body.captionByPlatform) ? body.captionByPlatform : {}
    const instagramCaption = clampString(captionObj.instagram, 4000)
    const facebookCaption = clampString(captionObj.facebook, 4000)
    const mediaUrls: string[] = []
    const rawMediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls.slice(0, 10) : []
    for (const value of rawMediaUrls) {
        const sanitizedMediaUrl = sanitizePublicMediaUrl(value)
        if (sanitizedMediaUrl) {
            mediaUrls.push(sanitizedMediaUrl)
            continue
        }

        if (typeof value === 'string' && value.startsWith('data:')) {
            mediaUrls.push(value.slice(0, 8_000_000))
            continue
        }

        throw new Error('Invalid media URL')
    }

    let scheduledAt: string | null = null
    if (body.scheduledAt != null) {
        const raw = typeof body.scheduledAt === 'string' ? body.scheduledAt : ''
        if (!raw) throw new Error('Invalid scheduled date')
        const date = new Date(raw)
        if (Number.isNaN(date.getTime())) throw new Error('Invalid scheduled date')
        scheduledAt = date.toISOString()
    }

    const id = body.id != null ? assertUuid(body.id, 'post id') : undefined

    return {
        id,
        platforms,
        captionByPlatform: {
            instagram: instagramCaption || undefined,
            facebook: facebookCaption || undefined,
        },
        mediaUrls,
        status,
        scheduledAt,
    }
}

export function sanitizeAICaptionPayload(body: unknown): AICaptionRequest & { workspaceId?: string } {
    if (!isPlainObject(body)) {
        throw new Error('Invalid AI caption request')
    }

    const description = clampString(body.description, 4000)
    if (!description) {
        throw new Error('Description is required')
    }

    const platforms = sanitizePlatformList(body.platforms)
    if (platforms.length === 0) {
        throw new Error('At least one valid platform is required')
    }

    const tone = typeof body.tone === 'string' && (ALLOWED_TONES as readonly string[]).includes(body.tone)
        ? body.tone as AICaptionRequest['tone']
        : undefined
    const language = clampString(body.language, 32) || undefined
    const workspaceId = body.workspaceId != null ? assertUuid(body.workspaceId, 'workspaceId') : undefined

    return { description, platforms, tone, language, workspaceId }
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
        facebook_page: clampString(body.facebook_page, 160),
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
    if ('facebook_page' in body) payload.facebook_page = clampString(body.facebook_page, 160)
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
    if ('ai_image_model_name' in body) settings.ai_image_model_name = clampString(body.ai_image_model_name, 160) || null
    if ('ai_model_name' in body) settings.ai_model_name = clampString(body.ai_model_name, 160)
    if ('timezone' in body) settings.timezone = clampString(body.timezone, 80)
    if ('default_language' in body) settings.default_language = clampString(body.default_language, 16)
    if (typeof body.ai_temperature === 'number' && Number.isFinite(body.ai_temperature)) {
        settings.ai_temperature = Math.min(2, Math.max(0, body.ai_temperature))
    }
    if (typeof body.ai_max_tokens === 'number' && Number.isFinite(body.ai_max_tokens)) {
        settings.ai_max_tokens = Math.min(8192, Math.max(256, Math.round(body.ai_max_tokens)))
    }
    if (typeof body.floating_assistant_enabled === 'boolean') {
        settings.floating_assistant_enabled = body.floating_assistant_enabled
    }

    return { workspaceId, settings }
}

export function sanitizeChatSessionPayload(body: unknown): {
    title?: string
    messages?: Array<{ role: 'user' | 'assistant'; content: string; type?: string; data?: unknown }>
} {
    if (!isPlainObject(body)) {
        throw new Error('Invalid chat session payload')
    }

    const payload: {
        title?: string
        messages?: Array<{ role: 'user' | 'assistant'; content: string; type?: string; data?: unknown }>
    } = {}

    if ('title' in body) {
        payload.title = clampString(body.title, 120)
    }
    if ('messages' in body) {
        payload.messages = sanitizeChatSessionMessages(body.messages)
    }

    return payload
}
