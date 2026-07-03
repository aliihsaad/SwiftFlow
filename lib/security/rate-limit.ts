import { createAdminClient } from "@/utils/supabase/admin"

export interface RateLimitRule {
    scope: string
    subject: string
    limit: number
    windowSeconds: number
    bucketSeconds?: number
}

export interface RateLimitResult {
    allowed: boolean
    remaining: number
    retryAfterSeconds: number
}

interface RateLimitRow {
    allowed: boolean
    total_count: number
    remaining: number
    retry_after_seconds: number
}

const FAIL_CLOSED_RETRY_AFTER_SECONDS = 30

export class RateLimitExceededError extends Error {
    readonly retryAfterSeconds: number

    constructor(message: string, retryAfterSeconds: number) {
        super(message)
        this.name = "RateLimitExceededError"
        this.retryAfterSeconds = retryAfterSeconds
    }
}

export function getClientIp(request: Request): string {
    const forwardedFor = request.headers.get("x-forwarded-for") || ""
    const realIp = request.headers.get("x-real-ip") || ""
    const ip = forwardedFor.split(",")[0]?.trim() || realIp.trim() || "unknown"
    return ip.slice(0, 128)
}

export function normalizeRateLimitEmail(email: string): string {
    return email.trim().toLowerCase().slice(0, 320)
}

async function hashSubject(subject: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(subject)
    const digest = await crypto.subtle.digest("SHA-256", data)
    const bytes = Array.from(new Uint8Array(digest))
    return bytes.map((value) => value.toString(16).padStart(2, "0")).join("")
}

export async function consumeRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
    const subject = rule.subject.trim()
    if (!subject) {
        return { allowed: true, remaining: rule.limit, retryAfterSeconds: 0 }
    }
    const subjectHash = await hashSubject(subject)

    const supabaseAdmin = createAdminClient()
    const { data, error } = await supabaseAdmin.rpc("consume_rate_limit", {
        p_scope: rule.scope,
        p_subject_hash: subjectHash,
        p_limit: rule.limit,
        p_window_seconds: rule.windowSeconds,
        p_bucket_seconds: rule.bucketSeconds ?? 60,
    })

    // Fail closed: this limiter protects auth, Developer API, AI generation, and
    // message-send paths. An unreachable/broken limiter must not grant unlimited access.
    if (error) {
        console.error("[rate-limit] consume_rate_limit failed; failing closed:", error)
        return { allowed: false, remaining: 0, retryAfterSeconds: FAIL_CLOSED_RETRY_AFTER_SECONDS }
    }

    const row = Array.isArray(data) ? (data[0] as RateLimitRow | undefined) : undefined
    if (!row) {
        console.error("[rate-limit] consume_rate_limit returned no row; failing closed", { scope: rule.scope })
        return { allowed: false, remaining: 0, retryAfterSeconds: FAIL_CLOSED_RETRY_AFTER_SECONDS }
    }

    return {
        allowed: Boolean(row.allowed),
        remaining: Math.max(Number(row.remaining || 0), 0),
        retryAfterSeconds: Math.max(Number(row.retry_after_seconds || 0), 0),
    }
}

export async function enforceRateLimit(rule: RateLimitRule, message: string): Promise<void> {
    const result = await consumeRateLimit(rule)
    if (!result.allowed) {
        throw new RateLimitExceededError(message, result.retryAfterSeconds)
    }
}
