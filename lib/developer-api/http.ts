import { NextResponse } from "next/server"
import { RateLimitExceededError } from "@/lib/security/rate-limit"
import { redactSensitiveLogValue } from "@/lib/security/redaction"
import { authenticateDeveloperApiRequest, DeveloperApiAuthError } from "./auth"
import { getDeveloperApiRequestId, writeDeveloperApiAuditLog } from "./audit"
import type { DeveloperApiRateLimitKind } from "./rate-limit"
import type { DeveloperApiAuthContext, DeveloperApiScope } from "./types"

export async function withDeveloperApiAuth(
  request: Request,
  config: {
    requiredScopes: readonly DeveloperApiScope[]
    rateLimit: DeveloperApiRateLimitKind
    action: string
    route: string
  },
  handler: (context: DeveloperApiAuthContext) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = getDeveloperApiRequestId(request)
  let context: DeveloperApiAuthContext | null = null
  let keyPrefix: string | null = null

  try {
    context = await authenticateDeveloperApiRequest(request, config.requiredScopes, config.rateLimit)
    keyPrefix = context.keyPrefix
    const response = await handler(context)
    response.headers.set("x-request-id", requestId)
    await writeDeveloperApiAuditLog({
      request,
      requestId,
      context,
      action: config.action,
      route: config.route,
      scopesRequired: config.requiredScopes,
      statusCode: response.status,
    })
    return response
  } catch (error) {
    let status = 500
    let code = "internal_error"
    let message = "Developer API request failed"
    let retryAfterSeconds: number | null = null

    if (error instanceof DeveloperApiAuthError) {
      status = error.status
      code = error.code
      message = error.message
      keyPrefix = error.keyPrefix
    } else if (error instanceof RateLimitExceededError) {
      status = 429
      code = "rate_limited"
      message = error.message
      retryAfterSeconds = error.retryAfterSeconds
    } else {
      console.error("[developer-api] route error", redactSensitiveLogValue(error))
    }

    await writeDeveloperApiAuditLog({
      request,
      requestId,
      context,
      keyPrefix,
      action: config.action,
      route: config.route,
      scopesRequired: config.requiredScopes,
      statusCode: status,
      errorCode: code,
    })

    const response = NextResponse.json({ error: message, code, requestId }, { status })
    response.headers.set("x-request-id", requestId)
    if (retryAfterSeconds != null) response.headers.set("retry-after", String(retryAfterSeconds))
    return response
  }
}
