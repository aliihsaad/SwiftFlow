export const DEVELOPER_API_AUTH_HEADER_EXAMPLE = "Authorization: Bearer <your_api_key>"

export const DEVELOPER_API_CODEX_CONFIG_TEMPLATE = `[mcp_servers.swiftflow-developer-api]
url = "https://social.swiftdigital-s.com/api/developer/mcp"
bearer_token_env_var = "SWIFTFLOW_API_KEY"
tool_timeout_sec = 120
enabled = true`

export function buildDeveloperApiGuide(origin: string) {
  const baseUrl = origin.replace(/\/$/, "")
  return {
    baseUrl,
    mcpUrl: `${baseUrl}/api/developer/mcp`,
    openApiUrl: `${baseUrl}/api/developer/openapi.json`,
  }
}
