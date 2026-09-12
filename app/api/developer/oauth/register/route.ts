import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getDeveloperOAuthScope } from "@/lib/developer-api/oauth"
import { isAcceptableRedirectUri, registerDeveloperOAuthClient } from "@/lib/developer-api/oauth-clients"

export const runtime = "nodejs"

type RegistrationMetadata = {
  client_name?: string
  redirect_uris?: string[]
  scope?: string
  token_endpoint_auth_method?: string
  grant_types?: string[]
}

async function readRegistrationMetadata(request: NextRequest): Promise<RegistrationMetadata> {
  try {
    const json = await request.json()
    return json && typeof json === "object" ? json as RegistrationMetadata : {}
  } catch {
    return {}
  }
}

export async function POST(request: NextRequest) {
  const metadata = await readRegistrationMetadata(request)

  // redirect_uris becomes the exact-match allowlist enforced at /authorize, so
  // a registration without at least one usable HTTPS URI cannot be honoured.
  // Previously this endpoint persisted nothing and /authorize accepted any
  // https URI, which is what made the connector phishable.
  const redirectUris = Array.isArray(metadata.redirect_uris)
    ? metadata.redirect_uris.filter(isAcceptableRedirectUri)
    : []

  if (redirectUris.length === 0) {
    return NextResponse.json({
      error: "invalid_redirect_uri",
      error_description: "At least one HTTPS redirect_uri without a fragment is required",
    }, { status: 400 })
  }

  const clientId = `swiftflow-mcp-${randomUUID()}`
  const clientName = metadata.client_name || "SwiftFlow MCP Connector"
  const scope = metadata.scope || getDeveloperOAuthScope()

  try {
    await registerDeveloperOAuthClient({ clientId, clientName, redirectUris, scope })
  } catch (error) {
    console.error("[oauth/register] Failed to persist client:", error)
    return NextResponse.json({
      error: "server_error",
      error_description: "Could not complete client registration",
    }, { status: 500 })
  }

  return NextResponse.json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName,
    redirect_uris: redirectUris,
    scope,
    token_endpoint_auth_method: metadata.token_endpoint_auth_method === "none" ? "none" : "none",
    response_types: ["code"],
    grant_types: Array.isArray(metadata.grant_types) && metadata.grant_types.includes("refresh_token")
      ? Array.from(new Set(["authorization_code", ...metadata.grant_types])).filter((grant) => grant === "authorization_code" || grant === "refresh_token")
      : ["authorization_code", "refresh_token"],
  }, { status: 201 })
}
