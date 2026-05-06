type JsonRecord = Record<string, unknown>

export interface AutomationImageStateInput {
    workflow_config?: {
        media_mode?: unknown
    } | null
    post_media_urls?: unknown
}

export function isJsonRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function getExistingMediaUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return []
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
}

export function shouldGenerateAutomationImage(input: AutomationImageStateInput): boolean {
    const mediaMode = input.workflow_config?.media_mode
    if (mediaMode !== 'generated_image') return false
    return getExistingMediaUrls(input.post_media_urls).length === 0
}

export function buildMediaResultSnapshot(
    currentSnapshot: unknown,
    mediaUrls: string[],
    postId: string,
): JsonRecord {
    const base = isJsonRecord(currentSnapshot) ? currentSnapshot : {}
    return {
        ...base,
        media_urls: mediaUrls,
        post_id: postId,
    }
}

export function getCaptionFromResultSnapshot(snapshot: unknown, fallback: string): string {
    if (isJsonRecord(snapshot) && typeof snapshot.caption === 'string' && snapshot.caption.trim()) {
        return snapshot.caption.trim()
    }
    return fallback
}
