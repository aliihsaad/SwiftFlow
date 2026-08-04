/**
 * Settings UI messaging for the automatic Instagram token-renewal lifecycle.
 *
 * Pure logic so the state machine can be tested without React. It consumes only
 * the non-secret fields exposed by `sanitizeMetaAccountMetadataForClient`.
 */

export type InstagramTokenHealth = "valid" | "expiring_soon" | "invalid" | null

export type InstagramRenewalStatus =
  | "succeeded"
  | "retry_scheduled"
  | "deferred_too_new"
  | "reconnect_required"

/** Shape returned by GET /api/brand/social-status, after sanitization. */
export type ConnectedSocialAccount = {
  platform: string
  account_name: string | null
  account_id: string | null
  token_expires_at: string | null
  metadata: {
    token_health?: InstagramTokenHealth
    token_issued_at?: string
    token_refreshed_at?: string
    token_refresh_last_status?: InstagramRenewalStatus
    token_refresh_next_at?: string
    reconnect_required?: boolean
  }
}

export type RenewalNotice = {
  tone: "error" | "warning" | "success"
  title: string
  message: string
}

export function formatRenewalTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleString()
}

/**
 * Collapses token health and renewal lifecycle into at most one notice.
 *
 * Precedence is deliberate and exhaustive — reconnect required > retry
 * scheduled > expiring soon > healthy — so the healthy banner can never render
 * alongside a retry or reconnect warning.
 */
export function deriveRenewalNotice(
  connected: boolean,
  account: ConnectedSocialAccount | undefined,
  fallbackTokenHealth: InstagramTokenHealth = null,
): RenewalNotice | null {
  if (!connected) return null

  const metadata = account?.metadata ?? {}
  const health = metadata.token_health ?? fallbackTokenHealth ?? null

  if (
    metadata.reconnect_required === true ||
    health === "invalid" ||
    metadata.token_refresh_last_status === "reconnect_required"
  ) {
    return {
      tone: "error",
      title: "Connection expired — reconnect required",
      message:
        "Instagram rejected the saved access token, so automatic renewal has stopped. Syncing and automations will fail until you reconnect Instagram.",
    }
  }

  if (metadata.token_refresh_last_status === "retry_scheduled") {
    const nextRetryAt = formatRenewalTimestamp(metadata.token_refresh_next_at)
    return {
      tone: "warning",
      title: "Automatic renewal will retry",
      message: nextRetryAt
        ? `The last renewal attempt did not go through. The next automatic attempt is scheduled for ${nextRetryAt}. No action is needed unless this keeps repeating.`
        : "The last renewal attempt did not go through. Automatic renewal keeps retrying with backoff. No action is needed unless this keeps repeating.",
    }
  }

  if (health === "expiring_soon") {
    return {
      tone: "warning",
      title: "Connection expiring soon",
      message:
        "The saved Instagram access token expires within 7 days. No retry is pending — automatic renewal runs on schedule and will refresh it before it expires.",
    }
  }

  if (health === "valid") {
    const expiresAt = formatRenewalTimestamp(account?.token_expires_at)
    return {
      tone: "success",
      title: "Token renewal is managed automatically",
      message: expiresAt
        ? `SwiftFlow renews the Instagram token in the background. The current token is valid until ${expiresAt}.`
        : "SwiftFlow renews the Instagram token in the background before it expires.",
    }
  }

  return null
}
