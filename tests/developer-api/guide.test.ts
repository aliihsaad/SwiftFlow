import { describe, expect, it } from "vitest"
import {
  buildDeveloperApiGuide,
  DEVELOPER_API_AUTH_HEADER_EXAMPLE,
  DEVELOPER_API_MCP_CONFIG_TEMPLATE,
} from "@/lib/developer-api/guide"

describe("developer API guide", () => {
  it("builds production connector URLs from an origin", () => {
    expect(buildDeveloperApiGuide("https://social.swiftdigital-s.com")).toEqual({
      baseUrl: "https://social.swiftdigital-s.com",
      mcpUrl: "https://social.swiftdigital-s.com/api/developer/mcp",
      openApiUrl: "https://social.swiftdigital-s.com/api/developer/openapi.json",
      oauthMetadataUrl: "https://social.swiftdigital-s.com/.well-known/oauth-protected-resource",
    })
  })

  it("keeps setup snippets secret-free", () => {
    expect(DEVELOPER_API_AUTH_HEADER_EXAMPLE).toBe("Authorization: Bearer <your_api_key>")
    expect(DEVELOPER_API_MCP_CONFIG_TEMPLATE).toContain("bearer_token_env_var = \"SWIFTFLOW_API_KEY\"")
    expect(DEVELOPER_API_MCP_CONFIG_TEMPLATE).not.toContain("sf_live_")
  })
})
