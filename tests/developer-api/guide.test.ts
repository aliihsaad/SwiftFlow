import { describe, expect, it } from "vitest"
import {
  buildDeveloperApiGuide,
  buildDeveloperApiMcpConfig,
  DEVELOPER_API_AUTH_HEADER_EXAMPLE,
} from "@/lib/developer-api/guide"

describe("developer API guide", () => {
  it("builds production connector URLs from an origin", () => {
    expect(buildDeveloperApiGuide("https://social-media-manager-ai-ecru.vercel.app")).toEqual({
      baseUrl: "https://social-media-manager-ai-ecru.vercel.app",
      mcpUrl: "https://social-media-manager-ai-ecru.vercel.app/api/developer/mcp",
      openApiUrl: "https://social-media-manager-ai-ecru.vercel.app/api/developer/openapi.json",
      oauthMetadataUrl: "https://social-media-manager-ai-ecru.vercel.app/.well-known/oauth-protected-resource",
    })
  })

  it("points the MCP client config at the given MCP endpoint", () => {
    const config = buildDeveloperApiMcpConfig("https://swiftflow.example.test/api/developer/mcp")

    expect(config).toContain("url = \"https://swiftflow.example.test/api/developer/mcp\"")
    expect(config).not.toContain("swiftdigital-s.com")
  })

  it("keeps setup snippets secret-free", () => {
    const config = buildDeveloperApiMcpConfig("https://swiftflow.example.test/api/developer/mcp")

    expect(DEVELOPER_API_AUTH_HEADER_EXAMPLE).toBe("Authorization: Bearer <your_api_key>")
    expect(config).toContain("bearer_token_env_var = \"SWIFTFLOW_API_KEY\"")
    expect(config).not.toContain("sf_live_")
  })
})
