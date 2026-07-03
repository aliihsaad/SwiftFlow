/**
 * Meta token health evaluation. Pure TypeScript (no Deno/Node APIs) so the
 * token-health-sweep function and the Vitest suite share the same logic.
 */

export type TokenHealthStatus = "valid" | "expiring_soon" | "invalid"

export type DebugTokenData = {
    is_valid?: unknown
    expires_at?: unknown
    scopes?: unknown[]
    granular_scopes?: Array<{ scope?: unknown; target_ids?: unknown[] }>
}

export type TokenHealth = {
    status: TokenHealthStatus
    /** ISO expiry; null when the token does not expire (expires_at=0). */
    expiresAt: string | null
    scopes: string[]
    granularScopes: Array<{ scope: string; target_ids?: string[] }>
}

const EXPIRING_SOON_DAYS = 7

export function resolveTokenHealth(data: DebugTokenData | null | undefined, now: Date = new Date()): TokenHealth {
    const scopes = Array.isArray(data?.scopes)
        ? data.scopes.filter((s): s is string => typeof s === "string")
        : []
    const granularScopes = Array.isArray(data?.granular_scopes)
        ? data.granular_scopes
            .filter((s) => typeof s?.scope === "string")
            .map((s) => ({
                scope: String(s.scope),
                target_ids: Array.isArray(s?.target_ids)
                    ? s.target_ids.filter((id): id is string => typeof id === "string")
                    : undefined,
            }))
        : []

    const rawExpires = data?.expires_at
    const expiresAtSeconds = typeof rawExpires === "number" && Number.isFinite(rawExpires) ? rawExpires : 0
    const expiresAt = expiresAtSeconds > 0 ? new Date(expiresAtSeconds * 1000).toISOString() : null

    if (data?.is_valid !== true || (expiresAt && new Date(expiresAt) <= now)) {
        return { status: "invalid", expiresAt, scopes, granularScopes }
    }

    const expiringCutoff = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000)
    if (expiresAt && new Date(expiresAt) <= expiringCutoff) {
        return { status: "expiring_soon", expiresAt, scopes, granularScopes }
    }

    return { status: "valid", expiresAt, scopes, granularScopes }
}

/** Whether an account is due for a health check (default cadence ~daily). */
export function isTokenCheckDue(
    lastCheckedAtIso: string | null | undefined,
    now: Date = new Date(),
    minIntervalHours = 20,
): boolean {
    if (!lastCheckedAtIso) return true
    const lastChecked = new Date(lastCheckedAtIso)
    if (!Number.isFinite(lastChecked.getTime())) return true
    return now.getTime() - lastChecked.getTime() >= minIntervalHours * 60 * 60 * 1000
}
