export type AutomationType = 'comment_to_dm'

export type TriggerType = 'any_comment' | 'keywords'

export interface TriggerConfig {
    trigger_type: TriggerType
    keywords: string[]
}

export interface CommentReplyConfig {
    enabled: boolean
    messages: string[]
    use_ai_response?: boolean
}

export interface DMConfig {
    opening_message: string
    button_text: string
    link_url: string
    link_message?: string
    use_ai_response?: boolean
}

export interface Automation {
    id: string
    workspace_id: string
    social_account_id: string
    type: AutomationType
    name: string
    is_active: boolean
    platform_post_id: string
    post_thumbnail_url?: string
    post_caption?: string
    trigger_config: TriggerConfig
    comment_reply_config: CommentReplyConfig
    dm_config: DMConfig
    workflow_graph?: import('./automation-graph').WorkflowGraph
    editor_version?: 'wizard' | 'canvas'
    total_triggered: number
    total_dms_sent: number
    created_at: string
    updated_at: string
}

export interface AutomationLog {
    id: string
    automation_id: string
    trigger_comment_id: string
    commenter_id: string
    commenter_username?: string
    comment_reply_sent: boolean
    dm_sent: boolean
    status: 'pending' | 'processing' | 'completed' | 'failed'
    error_message?: string
    triggered_at: string
}

export interface CreateAutomationPayload {
    social_account_id: string
    name: string
    platform_post_id: string
    post_thumbnail_url?: string
    post_caption?: string
    trigger_config: TriggerConfig
    comment_reply_config: CommentReplyConfig
    dm_config: DMConfig
}

export interface UpdateAutomationPayload {
    name?: string
    is_active?: boolean
    trigger_config?: TriggerConfig
    comment_reply_config?: CommentReplyConfig
    dm_config?: DMConfig
}

export interface InstagramMedia {
    id: string
    media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM'
    /** Instagram surface (FEED | REELS | STORY | AD); absent for Facebook posts. */
    media_product_type?: string
    media_url?: string
    thumbnail_url?: string
    caption?: string
    timestamp: string
    permalink: string
}
