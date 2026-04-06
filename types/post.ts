export type Platform = 'instagram' | 'facebook'
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed'

export interface PostData {
    platforms: Platform[]
    captionByPlatform: {
        instagram?: string
        facebook?: string
    }
    mediaUrls: string[]
    status: PostStatus
    scheduledAt?: string
}

export interface PostPublishResult {
    platform: Platform | string
    success: boolean
    platformPostId?: string
    error?: string
    errorCode?: string
}

export interface AICaptionRequest {
    description: string
    platforms: Platform[]
    mediaUrls?: string[]
    tone?: 'educational' | 'funny' | 'professional'
    language?: string
}

export interface AICaptionResponse {
    suggestions: string[]
}
