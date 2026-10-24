/** A reply node may skip threaded replies without stopping downstream nodes. */
export function shouldSkipCommentReply(
  config: { top_level_only?: unknown },
  context: { parent_id?: unknown },
): boolean {
  return config.top_level_only === true
    && typeof context.parent_id === 'string'
    && context.parent_id.trim().length > 0
}

export function skippedCommentReplyResult() {
  return { success: true, output: { skipped: true, reason: 'top_level_comments_only' } }
}
