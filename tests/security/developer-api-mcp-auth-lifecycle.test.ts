import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"
import { POST as mcpPost } from "@/app/api/developer/mcp/route"
import { createDeveloperOAuthAccessToken } from "@/lib/developer-api/oauth"

const origin = "https://social.swiftdigital-s.com"
const pepper = "phase-1-mcp-pepper"

function jsonRpcRequest(token: string) {
  return new NextRequest(`${origin}/api/developer/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "workspace-call",
      method: "tools/call",
      params: {
        name: "swiftflow_get_workspace",
        arguments: {},
      },
    }),
  })
}

describe("developer API MCP auth lifecycle", () => {
  it("rejects expired OAuth connector access tokens before tool handling", async () => {
    process.env.DEVELOPER_API_KEY_PEPPER = pepper
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const token = createDeveloperOAuthAccessToken({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/mcp`,
      pepper,
      now: Math.floor(Date.now() / 1000) - 2 * 60 * 60,
    })

    const response = await mcpPost(jsonRpcRequest(token))

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain("oauth-protected-resource")
    await expect(response.json()).resolves.toMatchObject({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "Invalid or expired SwiftFlow OAuth token",
      },
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("rejects OAuth connector access tokens minted for a different MCP resource", async () => {
    process.env.DEVELOPER_API_KEY_PEPPER = pepper
    const token = createDeveloperOAuthAccessToken({
      apiKey: "sf_live_test_key",
      scope: "swiftflow.developer_api",
      resource: `${origin}/api/developer/other-mcp`,
      pepper,
    })

    const response = await mcpPost(jsonRpcRequest(token))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: "Invalid or expired SwiftFlow OAuth token",
      },
    })
  })
})
