import { NextRequest, NextResponse } from "next/server"
import {
  createDeveloperOAuthAccessToken,
  createDeveloperOAuthRefreshToken,
  getDeveloperOAuthAccessTokenTtlSeconds,
  getDeveloperOAuthRefreshTokenTtlSeconds,
  normalizeDeveloperOAuthResource,
  verifyDeveloperOAuthCode,
  verifyDeveloperOAuthRefreshToken,
  verifyPkceChallenge,
} from "@/lib/developer-api/oauth"
import { getDeveloperApiKeyPepper } from "@/lib/developer-api/key-format"
import { claimDeveloperOAuthCode } from "@/lib/developer-api/oauth-clients"

export const runtime = "nodejs"

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

async function readTokenParams(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    const json = await request.json()
    const params = new Map<string, FormDataEntryValue>()
    if (json && typeof json === "object") {
      for (const [key, value] of Object.entries(json)) {
        if (typeof value === "string") params.set(key, value)
      }
    }
    return params
  }

  const form = await request.formData()
  return form
}

async function verifyBackingDeveloperApiKey(origin: string, apiKey: string): Promise<boolean> {
  const response = await fetch(`${origin}/api/developer/v1/workspace`, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })
  return response.ok
}

function tokenResponse(payload: {
  apiKey: string
  scope: string
  resource: string
  clientId: string
}) {
  const pepper = getDeveloperApiKeyPepper()
  const normalizedResource = normalizeDeveloperOAuthResource(payload.resource)
  return NextResponse.json({
    access_token: createDeveloperOAuthAccessToken({
      apiKey: payload.apiKey,
      scope: payload.scope,
      resource: normalizedResource,
      pepper,
    }),
    refresh_token: createDeveloperOAuthRefreshToken({
      apiKey: payload.apiKey,
      clientId: payload.clientId,
      scope: payload.scope,
      resource: normalizedResource,
      pepper,
    }),
    token_type: "Bearer",
    expires_in: getDeveloperOAuthAccessTokenTtlSeconds(),
    refresh_token_expires_in: getDeveloperOAuthRefreshTokenTtlSeconds(),
    scope: payload.scope,
  }, {
    headers: {
      "cache-control": "no-store",
    },
  })
}

export async function POST(request: NextRequest) {
  const form = await readTokenParams(request)
  const grantType = form.get("grant_type")
  if (grantType !== "authorization_code" && grantType !== "refresh_token") {
    return tokenError("unsupported_grant_type", "Only authorization_code and refresh_token are supported")
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token")
    const clientId = form.get("client_id")
    const resource = form.get("resource")
    if (typeof refreshToken !== "string") {
      return tokenError("invalid_request", "refresh_token is required")
    }

    let payload
    try {
      payload = verifyDeveloperOAuthRefreshToken(refreshToken, getDeveloperApiKeyPepper())
    } catch {
      return tokenError("invalid_grant", "Refresh token is invalid or expired")
    }

    if (typeof clientId === "string" && clientId && payload.clientId !== clientId) {
      return tokenError("invalid_grant", "client_id does not match the refresh token")
    }
    if (
      typeof resource === "string"
      && resource
      && normalizeDeveloperOAuthResource(payload.resource) !== normalizeDeveloperOAuthResource(resource)
    ) {
      return tokenError("invalid_target", "resource does not match the refresh token")
    }

    const keyWorks = await verifyBackingDeveloperApiKey(request.nextUrl.origin, payload.apiKey)
    if (!keyWorks) {
      return tokenError("invalid_grant", "Backing Developer API key is invalid, expired, or revoked")
    }

    return tokenResponse({
      apiKey: payload.apiKey,
      clientId: payload.clientId,
      scope: payload.scope,
      resource: payload.resource,
    })
  }

  const code = form.get("code")
  const codeVerifier = form.get("code_verifier")
  const redirectUri = form.get("redirect_uri")
  const clientId = form.get("client_id")
  const resource = form.get("resource")
  if (typeof code !== "string" || typeof codeVerifier !== "string") {
    return tokenError("invalid_request", "code and code_verifier are required")
  }

  let payload
  try {
    payload = verifyDeveloperOAuthCode(code, getDeveloperApiKeyPepper())
  } catch {
    return tokenError("invalid_grant", "Authorization code is invalid or expired")
  }

  if (typeof redirectUri === "string" && redirectUri && payload.redirectUri !== redirectUri) {
    return tokenError("invalid_grant", "redirect_uri does not match the authorization request")
  }
  if (typeof clientId === "string" && clientId && payload.clientId !== clientId) {
    return tokenError("invalid_grant", "client_id does not match the authorization request")
  }
  if (
    typeof resource === "string"
    && resource
    && normalizeDeveloperOAuthResource(payload.resource) !== normalizeDeveloperOAuthResource(resource)
  ) {
    return tokenError("invalid_target", "resource does not match the authorization request")
  }
  if (!verifyPkceChallenge(codeVerifier, payload.codeChallenge)) {
    return tokenError("invalid_grant", "PKCE verification failed")
  }

  // Codes are single use. This runs only after every other check passes, so a
  // failed exchange does not burn an otherwise valid code. Codes minted before
  // the jti field existed carry none and skip the check; they expire within the
  // 10 minute code TTL.
  if (payload.jti) {
    let claimed: boolean
    try {
      claimed = await claimDeveloperOAuthCode({
        jti: payload.jti,
        clientId: payload.clientId,
        expiresAt: new Date(payload.exp * 1000),
      })
    } catch (error) {
      console.error("[oauth/token] Failed to record code redemption:", error)
      return tokenError("server_error", "Could not complete the token exchange", 500)
    }
    if (!claimed) {
      return tokenError("invalid_grant", "Authorization code has already been redeemed")
    }
  }

  return tokenResponse({
    apiKey: payload.apiKey,
    clientId: payload.clientId,
    scope: payload.scope,
    resource: payload.resource,
  })
}
