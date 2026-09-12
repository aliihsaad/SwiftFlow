import { NextRequest, NextResponse } from "next/server"
import { createDeveloperOAuthCode, getDeveloperOAuthScope, normalizeDeveloperOAuthResource } from "@/lib/developer-api/oauth"
import { getDeveloperApiKeyPepper } from "@/lib/developer-api/key-format"
import {
  getDeveloperOAuthClient,
  isAcceptableRedirectUri,
  isRegisteredRedirectUri,
} from "@/lib/developer-api/oauth-clients"

export const runtime = "nodejs"

const REQUIRED_PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method"] as const

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function htmlResponse(html: string, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  })
}

function errorPage(message: string, status = 400) {
  return htmlResponse(`<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SwiftFlow Connector</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#090a12;color:#fff;margin:0;display:grid;min-height:100vh;place-items:center">
  <main style="max-width:520px;padding:24px">
    <h1>SwiftFlow connector</h1>
    <p style="color:#ffb4b4">${escapeHtml(message)}</p>
  </main>
</body>
</html>`, status)
}

function validateAuthorizeParams(searchParams: URLSearchParams) {
  for (const name of REQUIRED_PARAMS) {
    if (!searchParams.get(name)) return `${name} is required`
  }
  if (searchParams.get("response_type") !== "code") return "response_type must be code"
  if (searchParams.get("code_challenge_method") !== "S256") return "code_challenge_method must be S256"
  const redirectUri = searchParams.get("redirect_uri") || ""
  if (!isAcceptableRedirectUri(redirectUri)) return "redirect_uri must be HTTPS and carry no fragment"
  return null
}

/**
 * Binds redirect_uri to the client that registered it.
 *
 * Without this the authorization code — which encrypts the operator's raw
 * Developer API key — could be delivered to any HTTPS host an attacker chose,
 * while the consent page rendered on the genuine SwiftFlow origin. PKCE does
 * not help there: it binds the code to whoever made the request, which in that
 * attack is the attacker. Exact matching against the registered set is the
 * control that closes it.
 *
 * Failures render an error page and never redirect, so an unregistered URI
 * cannot be used to bounce the user somewhere.
 */
async function resolveAuthorizeClient(params: URLSearchParams): Promise<string | null> {
  const clientId = params.get("client_id") || ""
  const redirectUri = params.get("redirect_uri") || ""

  let client
  try {
    client = await getDeveloperOAuthClient(clientId)
  } catch (error) {
    console.error("[oauth/authorize] Client lookup failed:", error)
    return "Could not verify the connector registration. Try again."
  }

  if (!client) {
    return "Unknown client_id. Register the connector before authorizing."
  }
  if (!isRegisteredRedirectUri(client, redirectUri)) {
    return "redirect_uri does not match a registered redirect URI for this client."
  }
  return null
}

async function verifyDeveloperApiKey(origin: string, apiKey: string) {
  const response = await fetch(`${origin}/api/developer/v1/workspace`, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  })
  return response.ok
}

export async function GET(request: NextRequest) {
  const error = validateAuthorizeParams(request.nextUrl.searchParams)
  if (error) return errorPage(error)

  const clientError = await resolveAuthorizeClient(request.nextUrl.searchParams)
  if (clientError) return errorPage(clientError)

  const hiddenFields = Array.from(request.nextUrl.searchParams.entries())
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join("\n")

  return htmlResponse(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Connect SwiftFlow</title>
</head>
<body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#090a12;color:#fff;margin:0;display:grid;min-height:100vh;place-items:center">
  <main style="width:min(520px,calc(100vw - 32px));border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#151620;padding:24px">
    <h1 style="margin:0 0 8px">Connect SwiftFlow</h1>
    <p style="color:rgba(255,255,255,.68);line-height:1.5">Paste a SwiftFlow Developer API key. Your connector will receive a short-lived OAuth token, not the original API key.</p>
    <form method="post" style="display:grid;gap:14px;margin-top:18px">
      ${hiddenFields}
      <label style="display:grid;gap:6px;font-size:14px;color:rgba(255,255,255,.75)">
        Developer API key
        <input name="api_key" type="password" required autocomplete="off" placeholder="sf_live_..." style="border:1px solid rgba(255,255,255,.16);border-radius:8px;background:#0b0c12;color:#fff;padding:12px">
      </label>
      <button type="submit" style="border:0;border-radius:8px;background:#8b5cf6;color:#fff;font-weight:700;padding:12px 14px">Connect</button>
    </form>
  </main>
</body>
</html>`)
}

export async function POST(request: NextRequest) {
  const form = await request.formData()
  const params = new URLSearchParams()
  for (const [key, value] of form.entries()) {
    if (key !== "api_key" && typeof value === "string") params.set(key, value)
  }

  const error = validateAuthorizeParams(params)
  if (error) return errorPage(error)

  // Re-checked on POST as well: the GET check guards the page render, but the
  // form fields are attacker-controllable on the way back in.
  const clientError = await resolveAuthorizeClient(params)
  if (clientError) return errorPage(clientError)

  const apiKey = form.get("api_key")
  if (typeof apiKey !== "string" || !apiKey.startsWith("sf_live_")) {
    return errorPage("Enter a valid SwiftFlow Developer API key")
  }
  const keyWorks = await verifyDeveloperApiKey(request.nextUrl.origin, apiKey)
  if (!keyWorks) return errorPage("SwiftFlow rejected this Developer API key", 401)

  const redirectUri = params.get("redirect_uri") || ""
  const redirect = new URL(redirectUri)
  redirect.searchParams.set("code", createDeveloperOAuthCode({
    apiKey,
    clientId: params.get("client_id") || "",
    redirectUri,
    codeChallenge: params.get("code_challenge") || "",
    scope: params.get("scope") || getDeveloperOAuthScope(),
    resource: normalizeDeveloperOAuthResource(params.get("resource") || `${request.nextUrl.origin}/api/developer/mcp`),
    pepper: getDeveloperApiKeyPepper(),
  }))
  const state = params.get("state")
  if (state) redirect.searchParams.set("state", state)
  return NextResponse.redirect(redirect, 303)
}
