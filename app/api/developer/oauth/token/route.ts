import { NextRequest, NextResponse } from "next/server"
import {
  createDeveloperOAuthAccessToken,
  getDeveloperOAuthAccessTokenTtlSeconds,
  normalizeDeveloperOAuthResource,
  verifyDeveloperOAuthCode,
  verifyPkceChallenge,
} from "@/lib/developer-api/oauth"
import { getDeveloperApiKeyPepper } from "@/lib/developer-api/key-format"

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

export async function POST(request: NextRequest) {
  const form = await readTokenParams(request)
  const grantType = form.get("grant_type")
  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type", "Only authorization_code is supported")
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

  const accessToken = createDeveloperOAuthAccessToken({
    apiKey: payload.apiKey,
    scope: payload.scope,
    resource: normalizeDeveloperOAuthResource(payload.resource),
    pepper: getDeveloperApiKeyPepper(),
  })

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: getDeveloperOAuthAccessTokenTtlSeconds(),
    scope: payload.scope,
  }, {
    headers: {
      "cache-control": "no-store",
    },
  })
}
