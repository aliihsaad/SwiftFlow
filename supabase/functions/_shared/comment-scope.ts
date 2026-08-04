/**
 * Comment-trigger post/Reel scope matching.
 *
 * Pure TypeScript (no Deno/Node APIs) so the orchestrator imports it at
 * runtime and the Vitest suite tests the exact same logic.
 *
 * Scope semantics for trigger_new_comment:
 *   - "any"       — every comment on any media (default)
 *   - "any_post"  — comments on regular posts only (excludes Reels)
 *   - "any_reel"  — comments on Reels only
 *   - "specific"  — comments on one selected post/Reel (config.post_id)
 *
 * Legacy configs (created before post_scope existed) carry only post_id:
 * a set post_id means "specific", otherwise "any".
 */

export type CommentPostScope = "any" | "any_post" | "any_reel" | "specific"

const COMMENT_POST_SCOPES: readonly CommentPostScope[] = ["any", "any_post", "any_reel", "specific"]

export function isCommentPostScope(value: unknown): value is CommentPostScope {
    return COMMENT_POST_SCOPES.includes(value as CommentPostScope)
}

export type CommentMediaType = "post" | "reel" | "unknown"

/**
 * Normalizes Instagram's media_product_type (FEED | REELS | STORY | AD) from
 * webhook payloads. Missing media types resolve to
 * "unknown".
 */
export function normalizeCommentMediaType(value: unknown): CommentMediaType {
    const raw = typeof value === "string" ? value.trim().toUpperCase() : ""
    if (!raw) return "unknown"
    if (raw === "REELS" || raw === "REEL") return "reel"
    return "post"
}

type CommentScopeConfig = {
    post_scope?: unknown
    post_id?: unknown
}

type CommentScopeContext = {
    post_id?: unknown
    media_type?: unknown
}

export function resolveCommentPostScope(config: CommentScopeConfig | null | undefined): CommentPostScope {
    if (isCommentPostScope(config?.post_scope)) return config.post_scope
    return config?.post_id ? "specific" : "any"
}

/**
 * Whether a comment event's media matches the trigger's scope.
 *
 * "specific" keeps the legacy lenient behavior: it only rejects when both the
 * configured and incoming post ids are present and differ. "any_reel" requires
 * a positively identified Reel, so unknown media
 * never matches Reel-only triggers, while "any_post" accepts it.
 */
export function commentTriggerScopeMatches(
    config: CommentScopeConfig | null | undefined,
    context: CommentScopeContext | null | undefined,
): boolean {
    switch (resolveCommentPostScope(config)) {
        case "any":
            return true
        case "specific": {
            const configuredPostId = typeof config?.post_id === "string" ? config.post_id : ""
            const incomingPostId = typeof context?.post_id === "string" ? context.post_id : ""
            return !configuredPostId || !incomingPostId || configuredPostId === incomingPostId
        }
        case "any_post":
            return normalizeCommentMediaType(context?.media_type) !== "reel"
        case "any_reel":
            return normalizeCommentMediaType(context?.media_type) === "reel"
    }
}
