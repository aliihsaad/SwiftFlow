import type {
    CreatePublishingAutomationPayload,
    PublishingAutomationApprovalMode,
    PublishingAutomationCaptionMode,
    PublishingAutomationCaptionStrategy,
    PublishingAutomationConsistencyConfig,
    PublishingAutomationIdeaMode,
    PublishingAutomationMediaMode,
    PublishingAutomationPlatformMode,
    PublishingAutomationScheduleMode,
    PublishingAutomationWorkflowConfig,
    UpdatePublishingAutomationPayload,
} from '@/types/publishing-automation'
import type { Platform } from '@/types/post'

type JsonRecord = Record<string, unknown>

const PLATFORMS: Platform[] = ['facebook', 'instagram']
const APPROVAL_MODES: PublishingAutomationApprovalMode[] = ['manual_review', 'auto_schedule', 'auto_publish']
const IDEA_MODES: PublishingAutomationIdeaMode[] = ['generate_new', 'fixed_topic', 'reuse_content_pillars']
const CAPTION_MODES: PublishingAutomationCaptionMode[] = ['generate', 'refine', 'use_template']
const MEDIA_MODES: PublishingAutomationMediaMode[] = ['none', 'generated_image', 'carousel', 'manual_required']
const PLATFORM_MODES: PublishingAutomationPlatformMode[] = ['facebook_only', 'instagram_only', 'facebook_and_instagram']
const CAPTION_STRATEGIES: PublishingAutomationCaptionStrategy[] = ['same_caption', 'platform_specific']
const SCHEDULE_MODES: PublishingAutomationScheduleMode[] = ['next_available_slot', 'fixed_weekly_slots', 'manual_run_only']
const BRAND_VOICE_SOURCES: PublishingAutomationConsistencyConfig['brand_voice_source'][] = ['workspace_profile', 'custom_override', 'hybrid']

function isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clampString(value: unknown, maxLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function clampOptionalString(value: unknown, maxLength: number): string | undefined {
    const normalized = clampString(value, maxLength)
    return normalized || undefined
}

function stringArray(value: unknown, maxItems: number, maxLength: number): string[] {
    if (!Array.isArray(value)) return []
    return value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
        .map((item) => item.slice(0, maxLength))
}

function bool(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback
}

function intRange(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === 'string' && allowed.includes(value as T) ? value as T : fallback
}

function platformModeFromPlatforms(platforms: Platform[]): PublishingAutomationPlatformMode {
    if (platforms.length === 1 && platforms[0] === 'facebook') return 'facebook_only'
    if (platforms.length === 1 && platforms[0] === 'instagram') return 'instagram_only'
    return 'facebook_and_instagram'
}

function sanitizePlatforms(value: unknown): Platform[] {
    if (!Array.isArray(value)) return []
    const unique = Array.from(new Set(
        value.filter((item): item is Platform => typeof item === 'string' && PLATFORMS.includes(item as Platform))
    ))
    return unique
}

function sanitizeWorkflowConfig(value: unknown, platforms: Platform[], approvalMode: PublishingAutomationApprovalMode): PublishingAutomationWorkflowConfig {
    const input = isRecord(value) ? value : {}
    return {
        idea_mode: oneOf(input.idea_mode, IDEA_MODES, 'generate_new'),
        caption_mode: oneOf(input.caption_mode, CAPTION_MODES, 'generate'),
        media_mode: oneOf(input.media_mode, MEDIA_MODES, platforms.includes('instagram') ? 'manual_required' : 'none'),
        platform_mode: oneOf(input.platform_mode, PLATFORM_MODES, platformModeFromPlatforms(platforms)),
        caption_strategy: oneOf(input.caption_strategy, CAPTION_STRATEGIES, 'same_caption'),
        approval_mode: oneOf(input.approval_mode, APPROVAL_MODES, approvalMode),
        schedule_mode: oneOf(input.schedule_mode, SCHEDULE_MODES, approvalMode === 'manual_review' ? 'manual_run_only' : 'next_available_slot'),
    }
}

function sanitizeScheduleConfig(value: unknown) {
    const input = isRecord(value) ? value : {}
    const sanitizeSlot = (entry: unknown) => {
        if (!isRecord(entry)) return null
        const day = intRange(entry.day, 0, 6, -1)
        const time = clampString(entry.time, 5)
        if (day < 0 || !/^\d{2}:\d{2}$/.test(time)) return null
        return { day, time }
    }
    const sanitizeWindow = (entry: unknown) => {
        if (!isRecord(entry)) return null
        const day = intRange(entry.day, 0, 6, -1)
        const start_time = clampString(entry.start_time, 5)
        const end_time = clampString(entry.end_time, 5)
        if (day < 0 || !/^\d{2}:\d{2}$/.test(start_time) || !/^\d{2}:\d{2}$/.test(end_time)) return null
        return { day, start_time, end_time }
    }

    return {
        timezone: clampString(input.timezone, 80) || 'UTC',
        posting_windows: Array.isArray(input.posting_windows)
            ? input.posting_windows.map(sanitizeWindow).filter((entry): entry is NonNullable<ReturnType<typeof sanitizeWindow>> => !!entry).slice(0, 14)
            : undefined,
        fixed_slots: Array.isArray(input.fixed_slots)
            ? input.fixed_slots.map(sanitizeSlot).filter((entry): entry is NonNullable<ReturnType<typeof sanitizeSlot>> => !!entry).slice(0, 14)
            : undefined,
    }
}

function sanitizeCtaConfig(value: unknown) {
    const input = isRecord(value) ? value : {}
    return {
        enabled: bool(input.enabled, false),
        text: clampOptionalString(input.text, 160),
        url: clampOptionalString(input.url, 2048),
    }
}

function sanitizeMediaPolicy(value: unknown, platforms: Platform[], workflow: PublishingAutomationWorkflowConfig) {
    const input = isRecord(value) ? value : {}
    const instagramSelected = platforms.includes('instagram')
    const generatedMedia = workflow.media_mode === 'generated_image' || workflow.media_mode === 'carousel'
    return {
        require_media: bool(input.require_media, instagramSelected),
        allow_generated_image: bool(input.allow_generated_image, generatedMedia),
        allow_carousel: bool(input.allow_carousel, workflow.media_mode === 'carousel'),
        manual_media_required_for_instagram: bool(input.manual_media_required_for_instagram, instagramSelected && !generatedMedia),
    }
}

function sanitizeConsistencyConfig(value: unknown): PublishingAutomationConsistencyConfig {
    const input = isRecord(value) ? value : {}
    return {
        brand_voice_source: oneOf(input.brand_voice_source, BRAND_VOICE_SOURCES, 'workspace_profile'),
        brand_voice_override: clampOptionalString(input.brand_voice_override, 2000),
        visual_style_prompt: clampOptionalString(input.visual_style_prompt, 2000),
        design_reference_asset_ids: stringArray(input.design_reference_asset_ids, 12, 120),
        color_palette: stringArray(input.color_palette, 12, 40),
        typography_notes: clampOptionalString(input.typography_notes, 1000),
        history_window_days: intRange(input.history_window_days, 1, 180, 45),
        recent_posts_limit: intRange(input.recent_posts_limit, 1, 50, 12),
        avoid_repeated_topics: bool(input.avoid_repeated_topics, true),
        avoid_repeated_captions: bool(input.avoid_repeated_captions, true),
        prefer_successful_patterns: bool(input.prefer_successful_patterns, false),
    }
}

function validateWorkflow(platforms: Platform[], workflow: PublishingAutomationWorkflowConfig, approvalMode: PublishingAutomationApprovalMode) {
    const expectedPlatformMode = platformModeFromPlatforms(platforms)
    if (workflow.platform_mode !== expectedPlatformMode) {
        throw new Error('Workflow platform mode must match selected platforms')
    }
    if (workflow.approval_mode !== approvalMode) {
        throw new Error('Workflow approval mode must match automation approval mode')
    }
    if (approvalMode !== 'manual_review' && workflow.schedule_mode === 'manual_run_only') {
        throw new Error('Scheduled automation requires a scheduled workflow mode')
    }
    if (platforms.includes('instagram') && approvalMode !== 'manual_review' && workflow.media_mode === 'none') {
        throw new Error('Instagram scheduled automation requires a media workflow')
    }
}

export function sanitizeCreatePublishingAutomationPayload(body: unknown): CreatePublishingAutomationPayload {
    if (!isRecord(body)) throw new Error('Invalid publishing automation payload')

    const name = clampString(body.name, 160)
    const content_goal = clampString(body.content_goal, 4000)
    const platforms = sanitizePlatforms(body.platforms)
    const approval_mode = oneOf(body.approval_mode, APPROVAL_MODES, 'manual_review')

    if (!name) throw new Error('Automation name is required')
    if (!content_goal) throw new Error('Content goal is required')
    if (platforms.length === 0) throw new Error('At least one valid platform is required')

    const workflow_config = sanitizeWorkflowConfig(body.workflow_config, platforms, approval_mode)
    validateWorkflow(platforms, workflow_config, approval_mode)

    return {
        name,
        platforms,
        approval_mode,
        content_goal,
        brand_voice: clampOptionalString(body.brand_voice, 1000),
        content_pillars: stringArray(body.content_pillars, 20, 160),
        excluded_terms: stringArray(body.excluded_terms, 50, 120),
        cta_config: sanitizeCtaConfig(body.cta_config),
        media_policy: sanitizeMediaPolicy(body.media_policy, platforms, workflow_config),
        consistency_config: sanitizeConsistencyConfig(body.consistency_config),
        workflow_config,
        schedule_config: sanitizeScheduleConfig(body.schedule_config),
        daily_cap: intRange(body.daily_cap, 1, 24, 1),
    }
}

export function sanitizeUpdatePublishingAutomationPayload(body: unknown): UpdatePublishingAutomationPayload {
    if (!isRecord(body)) throw new Error('Invalid publishing automation payload')

    const partial: UpdatePublishingAutomationPayload = {}
    if (body.name !== undefined) partial.name = clampString(body.name, 160)
    if (body.platforms !== undefined) partial.platforms = sanitizePlatforms(body.platforms)
    if (body.approval_mode !== undefined) partial.approval_mode = oneOf(body.approval_mode, APPROVAL_MODES, 'manual_review')
    if (body.content_goal !== undefined) partial.content_goal = clampString(body.content_goal, 4000)
    if (body.brand_voice !== undefined) partial.brand_voice = clampOptionalString(body.brand_voice, 1000)
    if (body.content_pillars !== undefined) partial.content_pillars = stringArray(body.content_pillars, 20, 160)
    if (body.excluded_terms !== undefined) partial.excluded_terms = stringArray(body.excluded_terms, 50, 120)
    if (body.cta_config !== undefined) partial.cta_config = sanitizeCtaConfig(body.cta_config)
    if (body.media_policy !== undefined) partial.media_policy = body.media_policy as UpdatePublishingAutomationPayload['media_policy']
    if (body.consistency_config !== undefined) partial.consistency_config = body.consistency_config as UpdatePublishingAutomationPayload['consistency_config']
    if (body.workflow_config !== undefined) partial.workflow_config = body.workflow_config as UpdatePublishingAutomationPayload['workflow_config']
    if (body.schedule_config !== undefined) partial.schedule_config = sanitizeScheduleConfig(body.schedule_config)
    if (body.daily_cap !== undefined) partial.daily_cap = intRange(body.daily_cap, 1, 24, 1)
    if (body.is_active !== undefined) partial.is_active = bool(body.is_active, false)

    if (partial.name !== undefined && !partial.name) throw new Error('Automation name is required')
    if (partial.content_goal !== undefined && !partial.content_goal) throw new Error('Content goal is required')
    if (partial.platforms !== undefined && partial.platforms.length === 0) throw new Error('At least one valid platform is required')

    return partial
}

export function sanitizeMergedPublishingAutomationPayload(
    current: CreatePublishingAutomationPayload,
    partial: UpdatePublishingAutomationPayload,
): CreatePublishingAutomationPayload {
    const merged = {
        ...current,
        ...partial,
        cta_config: partial.cta_config ?? current.cta_config,
        media_policy: partial.media_policy ?? current.media_policy,
        consistency_config: partial.consistency_config ?? current.consistency_config,
        workflow_config: partial.workflow_config ?? current.workflow_config,
        schedule_config: partial.schedule_config ?? current.schedule_config,
    }

    const validated = sanitizeCreatePublishingAutomationPayload(merged)
    return {
        ...validated,
        brand_voice: partial.brand_voice === undefined ? current.brand_voice : validated.brand_voice,
    }
}
