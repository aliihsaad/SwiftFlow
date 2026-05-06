import type { CreatePublishingAutomationPayload } from '@/types/publishing-automation'
import {
    getDefaultImageModelForProvider,
    getModelLabel,
    getTypographySafeImageModels,
    isAIProvider,
    isTypographySafeImageModel,
    type AIProvider,
} from '@/lib/ai-models'
import { sanitizeCreatePublishingAutomationPayload } from '@/lib/publishing-automation-validation'
import { createAdminClient } from '@/utils/supabase/admin'
import { isJsonRecord } from '@/lib/publishing-automation-run-media'

type JsonRecord = Record<string, unknown>

export interface BrandProfileSummary {
    business_name?: string | null
    industry?: string | null
    business_description?: string | null
    target_audience?: string | null
    brand_voice?: string | null
    unique_selling_points?: string[] | null
    content_themes?: string[] | null
    brand_colors?: {
        enabled?: boolean
        primary?: string
        secondary?: string
        accent?: string
    } | null
}

export interface ImageModelRecommendation {
    provider: AIProvider
    configuredModel: string | null
    effectiveModel: string | null
    effectiveModelLabel: string
    isRecommendedForText: boolean
    recommendedModels: Array<{ id: string; label: string }>
    textRenderingPolicy: 'exact_short_text_allowed' | 'caption_text_only'
}

export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error'
}

export function rowToPublishingAutomationPayload(row: JsonRecord): CreatePublishingAutomationPayload {
    return sanitizeCreatePublishingAutomationPayload({
        name: row.name,
        platforms: row.platforms,
        approval_mode: row.approval_mode,
        content_goal: row.content_goal,
        brand_voice: row.brand_voice,
        content_pillars: row.content_pillars,
        excluded_terms: row.excluded_terms,
        cta_config: row.cta_config,
        media_policy: row.media_policy,
        consistency_config: row.consistency_config,
        workflow_config: row.workflow_config,
        schedule_config: row.schedule_config,
        daily_cap: row.daily_cap,
    })
}

export function summarizeBrandProfile(profile: BrandProfileSummary | null): string {
    if (!profile) return 'No workspace brand profile found. Use the automation settings only.'
    const colors = profile.brand_colors?.enabled
        ? [profile.brand_colors.primary, profile.brand_colors.secondary, profile.brand_colors.accent].filter(Boolean).join(', ')
        : ''

    return [
        profile.business_name ? `Business: ${profile.business_name}` : '',
        profile.industry ? `Industry: ${profile.industry}` : '',
        profile.business_description ? `Description: ${profile.business_description}` : '',
        profile.target_audience ? `Target audience: ${profile.target_audience}` : '',
        profile.brand_voice ? `Brand voice: ${profile.brand_voice}` : '',
        profile.unique_selling_points?.length ? `Unique selling points: ${profile.unique_selling_points.join(', ')}` : '',
        profile.content_themes?.length ? `Content themes: ${profile.content_themes.join(', ')}` : '',
        colors ? `Brand colors: ${colors}` : '',
    ].filter(Boolean).join('\n') || 'Workspace brand profile is mostly empty.'
}

export function getImageModelRecommendation(settings: JsonRecord | null): ImageModelRecommendation {
    const provider: AIProvider = isAIProvider(String(settings?.ai_provider || ''))
        ? settings?.ai_provider as AIProvider
        : 'openrouter'
    const configuredModel = typeof settings?.ai_image_model_name === 'string' && settings.ai_image_model_name.trim()
        ? settings.ai_image_model_name.trim()
        : null
    const effectiveModel = configuredModel || getDefaultImageModelForProvider(provider)
    const isRecommendedForText = isTypographySafeImageModel(effectiveModel)

    return {
        provider,
        configuredModel,
        effectiveModel,
        effectiveModelLabel: getModelLabel(provider, 'image', effectiveModel),
        isRecommendedForText,
        recommendedModels: getTypographySafeImageModels(provider).map((model) => ({ id: model.id, label: model.label })),
        textRenderingPolicy: isRecommendedForText ? 'exact_short_text_allowed' : 'caption_text_only',
    }
}

export function buildAutomationImagePrompt(
    automation: CreatePublishingAutomationPayload,
    caption: string,
    brandProfile: BrandProfileSummary | null,
    imageModel: ImageModelRecommendation,
): string {
    const consistency = automation.consistency_config
    const palette = (consistency?.color_palette || []).join(', ') || 'workspace brand colors'
    const visualStyle = consistency?.visual_style_prompt || 'Build a consistent branded social poster system.'
    const typography = consistency?.typography_notes || 'Use expressive editorial typography: a high-contrast serif-style quote face paired with a clean geometric sans-style attribution and CTA. Avoid generic Arial/Roboto-looking text.'
    const textPolicy = imageModel.isRecommendedForText
        ? '- Text rendering is allowed only for one short exact quote phrase or attribution. Do not add extra words, CTA text, hashtags, or invented brand slogans. If unsure, use no text.'
        : `- The current image model (${imageModel.effectiveModelLabel}) is not recommended for typography-heavy quote images. Do not render body copy, captions, hashtags, CTA text, or full quote text inside the image. Keep the exact text in the post caption only.`

    return `Create a social media image for this caption:
${caption}

Workspace brand profile:
${summarizeBrandProfile(brandProfile)}

NON-NEGOTIABLE VISUAL DIRECTION:
- Create a designed brand poster, not a stock-photo scene.
- Do not use random laptops, tablets, desks, flowers, generic offices, or unrelated backgrounds unless the brand profile explicitly asks for them.
- Use one repeatable visual system across runs: same composition logic, same type hierarchy, same background language, same motif family.
- Background must be a custom designed backdrop: abstract gradient, paper grain, subtle geometric pattern, soft light field, or branded shape system.
- The post should feel creative and intentional, not a generic quote generator.
${textPolicy}

BRAND VISUAL SYSTEM:
${visualStyle}

COLORS:
Use ${palette}. Keep contrast high and avoid muddy beige/gray photo overlays.

TYPOGRAPHY:
${typography}
For this run: ${imageModel.textRenderingPolicy === 'caption_text_only' ? 'use typography as a visual inspiration only; do not render readable post text in the image.' : 'render any visible words with exact spelling, large size, and no extra generated copy.'}

LAYOUT:
- 1:1 square social image.
- Strong focal typography or abstract hero mark.
- Leave safe margins.
- Use a consistent signature detail such as a small accent line, corner mark, halo shape, or quote badge.
- Avoid visual repetition while keeping the same brand identity.`
}

export async function invokeEdgeFunction(functionName: string, body: JsonRecord): Promise<JsonRecord> {
    const admin = createAdminClient()
    const { data, error } = await admin.functions.invoke(functionName, { body })
    if (error) throw new Error(error.message || `${functionName} failed`)
    if (!isJsonRecord(data)) throw new Error(`${functionName} returned an invalid response`)
    if (typeof data.error === 'string' && data.error) throw new Error(data.error)
    return data
}

export function extractImageUrl(response: JsonRecord): string | null {
    const result = isJsonRecord(response.result) ? response.result : {}
    return typeof result.imageUrl === 'string' && result.imageUrl ? result.imageUrl : null
}
