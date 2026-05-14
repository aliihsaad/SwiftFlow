import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { getDeveloperOAuthScope } from "@/lib/developer-api/oauth"

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
  return NextResponse.json({
    client_id: `swiftflow-mcp-${randomUUID()}`,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: metadata.client_name || "SwiftFlow MCP Connector",
    redirect_uris: Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris : [],
    scope: metadata.scope || getDeveloperOAuthScope(),
    token_endpoint_auth_method: metadata.token_endpoint_auth_method === "none" ? "none" : "none",
    response_types: ["code"],
    grant_types: Array.isArray(metadata.grant_types) && metadata.grant_types.includes("refresh_token")
      ? Array.from(new Set(["authorization_code", ...metadata.grant_types])).filter((grant) => grant === "authorization_code" || grant === "refresh_token")
      : ["authorization_code", "refresh_token"],
  }, { status: 201 })
}
