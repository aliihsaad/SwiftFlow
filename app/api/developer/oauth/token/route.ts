import { NextRequest, NextResponse } from "next/server"
import {
  createDeveloperOAuthAccessToken,
  getDeveloperOAuthAccessTokenTtlSeconds,
  verifyDeveloperOAuthCode,
  verifyPkceChallenge,
} from "@/lib/developer-api/oauth"
import { getDeveloperApiKeyPepper } from "@/lib/developer-api/key-format"

export const runtime = "nodejs"

function tokenError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status })
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const grantType = form.get("grant_type")
  if (grantType !== "authorization_code") {
    return tokenError("unsupported_grant_type", "Only authorization_code is supported")
  }

  const code = form.get("code")
  const codeVerifier = form.get("code_verifier")
  const redirectUri = form.get("redirect_uri")
  const clientId = form.get("client_id")
  if (typeof code !== "string" || typeof codeVerifier !== "string" || typeof redirectUri !== "string") {
    return tokenError("invalid_request", "code, code_verifier, and redirect_uri are required")
  }

  let payload
  try {
    payload = verifyDeveloperOAuthCode(code, getDeveloperApiKeyPepper())
  } catch {
    return tokenError("invalid_grant", "Authorization code is invalid or expired")
  }

  if (payload.redirectUri !== redirectUri) {
    return tokenError("invalid_grant", "redirect_uri does not match the authorization request")
  }
  if (typeof clientId === "string" && clientId && payload.clientId !== clientId) {
    return tokenError("invalid_grant", "client_id does not match the authorization request")
  }
  if (!verifyPkceChallenge(codeVerifier, payload.codeChallenge)) {
    return tokenError("invalid_grant", "PKCE verification failed")
  }

  const accessToken = createDeveloperOAuthAccessToken({
    apiKey: payload.apiKey,
    scope: payload.scope,
    resource: payload.resource,
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
