import type { Platform } from './post'

export type PublishingAutomationApprovalMode = 'manual_review' | 'auto_schedule' | 'auto_publish'
export type PublishingAutomationRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

export type PublishingAutomationIdeaMode = 'generate_new' | 'fixed_topic' | 'reuse_content_pillars'
export type PublishingAutomationCaptionMode = 'generate' | 'refine' | 'use_template'
export type PublishingAutomationMediaMode = 'none' | 'generated_image' | 'carousel' | 'manual_required'
export type PublishingAutomationPlatformMode = 'facebook_only' | 'instagram_only' | 'facebook_and_instagram'
export type PublishingAutomationCaptionStrategy = 'same_caption' | 'platform_specific'
export type PublishingAutomationScheduleMode = 'next_available_slot' | 'fixed_weekly_slots' | 'manual_run_only'

export interface PublishingAutomationWorkflowConfig {
    idea_mode: PublishingAutomationIdeaMode
    caption_mode: PublishingAutomationCaptionMode
    media_mode: PublishingAutomationMediaMode
    platform_mode: PublishingAutomationPlatformMode
    caption_strategy: PublishingAutomationCaptionStrategy
    approval_mode: PublishingAutomationApprovalMode
    schedule_mode: PublishingAutomationScheduleMode
}

export interface PublishingAutomationScheduleConfig {
    timezone: string
    posting_windows?: Array<{
        day: number
        start_time: string
        end_time: string
    }>
    fixed_slots?: Array<{
        day: number
        time: string
    }>
}

export interface PublishingAutomationMediaPolicy {
    require_media: boolean
    allow_generated_image: boolean
    allow_carousel: boolean
    manual_media_required_for_instagram: boolean
}

export interface PublishingAutomationCtaConfig {
    enabled: boolean
    text?: string
    url?: string
}

export interface PublishingAutomationConsistencyConfig {
    brand_voice_source: 'workspace_profile' | 'custom_override' | 'hybrid'
    brand_voice_override?: string
    visual_style_prompt?: string
    design_reference_asset_ids?: string[]
    color_palette?: string[]
    typography_notes?: string
    history_window_days: number
    recent_posts_limit: number
    avoid_repeated_topics: boolean
    avoid_repeated_captions: boolean
    prefer_successful_patterns: boolean
}

export interface PublishingAutomation {
    id: string
    workspace_id: string
    name: string
    is_active: boolean
    platforms: Platform[]
    approval_mode: PublishingAutomationApprovalMode
    content_goal: string
    brand_voice?: string | null
    content_pillars: string[]
    excluded_terms: string[]
    cta_config: PublishingAutomationCtaConfig
    media_policy: PublishingAutomationMediaPolicy
    workflow_config: PublishingAutomationWorkflowConfig
    consistency_config: PublishingAutomationConsistencyConfig
    schedule_config: PublishingAutomationScheduleConfig
    daily_cap: number
    next_run_at?: string | null
    last_run_at?: string | null
    last_error?: string | null
    created_by?: string | null
    created_at: string
    updated_at: string
}

export interface PublishingAutomationRun {
    id: string
    workspace_id: string
    publishing_automation_id: string
    status: PublishingAutomationRunStatus
    generated_post_id?: string | null
    approval_mode: PublishingAutomationApprovalMode
    scheduled_for?: string | null
    prompt_snapshot: Record<string, unknown>
    result_snapshot: Record<string, unknown>
    error_message?: string | null
    created_at: string
    finished_at?: string | null
}

export interface CreatePublishingAutomationPayload {
    name: string
    platforms: Platform[]
    approval_mode: PublishingAutomationApprovalMode
    content_goal: string
    brand_voice?: string
    content_pillars?: string[]
    excluded_terms?: string[]
    cta_config?: Partial<PublishingAutomationCtaConfig>
    media_policy?: Partial<PublishingAutomationMediaPolicy>
    consistency_config?: Partial<PublishingAutomationConsistencyConfig>
    workflow_config: PublishingAutomationWorkflowConfig
    schedule_config: PublishingAutomationScheduleConfig
    daily_cap?: number
}

export interface UpdatePublishingAutomationPayload extends Partial<CreatePublishingAutomationPayload> {
    is_active?: boolean
}
