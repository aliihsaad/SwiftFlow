import { consumeRateLimit, getClientIp, RateLimitExceededError } from "@/lib/security/rate-limit"
import type { DeveloperApiAuthContext } from "./types"

export type DeveloperApiRateLimitKind = "read" | "write" | "expensive" | "failed_auth"

const LIMITS: Record<DeveloperApiRateLimitKind, { limit: number; windowSeconds: number; bucketSeconds: number }> = {
  read: { limit: 120, windowSeconds: 60, bucketSeconds: 60 },
  write: { limit: 30, windowSeconds: 60, bucketSeconds: 60 },
  expensive: { limit: 10, windowSeconds: 60, bucketSeconds: 60 },
  failed_auth: { limit: 20, windowSeconds: 600, bucketSeconds: 60 },
}

export async function enforceDeveloperApiRateLimit(params: {
  kind: DeveloperApiRateLimitKind
  context?: DeveloperApiAuthContext | null
  request?: Request
}) {
  const limit = LIMITS[params.kind]
  const subject = params.context
    ? `${params.kind}:workspace:${params.context.workspaceId}:key:${params.context.apiKeyId}`
    : `${params.kind}:ip:${params.request ? getClientIp(params.request) : "unknown"}`

  const result = await consumeRateLimit({
    scope: `developer_api:${params.kind}`,
    subject,
    limit: limit.limit,
    windowSeconds: limit.windowSeconds,
    bucketSeconds: limit.bucketSeconds,
  })

  if (!result.allowed) {
    throw new RateLimitExceededError("Developer API rate limit exceeded", result.retryAfterSeconds)
  }
}
