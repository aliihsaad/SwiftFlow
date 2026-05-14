import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { GET, POST } from "@/app/api/developer/mcp/route"

const origin = "https://social.swiftdigital-s.com"

describe("developer API MCP route authentication", () => {
  it("challenges unauthenticated discovery requests with OAuth metadata", async () => {
    const response = await GET(new NextRequest(`${origin}/api/developer/mcp`))

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(`${origin}/.well-known/oauth-protected-resource`)
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication required",
      protectedResource: "/.well-known/oauth-protected-resource",
    })
  })

  it("challenges unauthenticated JSON-RPC requests before listing tools", async () => {
    const response = await POST(new NextRequest(`${origin}/api/developer/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    }))

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toContain(`${origin}/.well-known/oauth-protected-resource`)
  })
})

describe("developer API MCP route streamable HTTP responses", () => {
  it("rejects authenticated GET requests because SSE is not supported", async () => {
    const response = await GET(new NextRequest(`${origin}/api/developer/mcp`, {
      headers: { authorization: "Bearer sf_live_test" },
    }))

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("POST, OPTIONS")
    expect(response.headers.get("mcp-protocol-version")).toBe("2025-03-26")
  })

  it("acknowledges JSON-RPC notifications with 202 accepted", async () => {
    const response = await POST(new NextRequest(`${origin}/api/developer/mcp`, {
      method: "POST",
      headers: {
        authorization: "Bearer sf_live_test",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    }))

    expect(response.status).toBe(202)
    expect(response.headers.get("mcp-protocol-version")).toBe("2025-03-26")
    await expect(response.text()).resolves.toBe("")
  })
})
