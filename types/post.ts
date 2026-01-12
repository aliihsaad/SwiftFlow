export type Platform = 'instagram' | 'facebook'
export type PostStatus = 'draft' | 'scheduled' | 'published'

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
