export const DEVELOPER_API_AUTH_HEADER_EXAMPLE = "Authorization: Bearer <your_api_key>"

export function buildDeveloperApiMcpConfig(mcpUrl: string) {
  return `[mcp_servers.swiftflow-developer-api]
url = "${mcpUrl}"
bearer_token_env_var = "SWIFTFLOW_API_KEY"
tool_timeout_sec = 120
enabled = true`
}

export function buildDeveloperApiGuide(origin: string) {
  const baseUrl = origin.replace(/\/$/, "")
  return {
    baseUrl,
    mcpUrl: `${baseUrl}/api/developer/mcp`,
    openApiUrl: `${baseUrl}/api/developer/openapi.json`,
    oauthMetadataUrl: `${baseUrl}/.well-known/oauth-protected-resource`,
  }
}
