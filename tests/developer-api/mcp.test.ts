import { describe, expect, it } from "vitest"
import {
  DEVELOPER_MCP_TOOLS,
  handleDeveloperMcpJsonRpc,
  type DeveloperMcpApiRequest,
} from "@/lib/developer-api/mcp"

describe("developer API MCP bridge", () => {
  it("advertises SwiftFlow developer tools", async () => {
    expect(DEVELOPER_MCP_TOOLS.map((tool) => tool.name)).toContain("swiftflow_get_workspace")
    expect(DEVELOPER_MCP_TOOLS.map((tool) => tool.name)).toContain("swiftflow_create_post")
    expect(DEVELOPER_MCP_TOOLS.map((tool) => tool.name)).toContain("swiftflow_toggle_automation")

    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, {
      callDeveloperApi: async () => ({ ok: true }),
    })

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "swiftflow_get_workspace",
            inputSchema: expect.objectContaining({ type: "object" }),
            securitySchemes: [{ type: "oauth2", scopes: ["swiftflow.developer_api"] }],
            _meta: {
              securitySchemes: [{ type: "oauth2", scopes: ["swiftflow.developer_api"] }],
            },
          }),
        ]),
      },
    })
  })

  it("marks every tool with auth and ChatGPT safety annotations", () => {
    for (const tool of DEVELOPER_MCP_TOOLS) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["swiftflow.developer_api"] }])
      expect(tool._meta?.securitySchemes).toEqual([{ type: "oauth2", scopes: ["swiftflow.developer_api"] }])
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      })
    }
  })

  it("turns tool calls into authenticated developer API requests", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: "swiftflow_create_post",
        arguments: {
          platforms: ["instagram"],
          captionByPlatform: { instagram: "MCP test post" },
          status: "draft",
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { post: { id: "post-1", status: "draft" } }
      },
    })

    expect(calls).toEqual([{
      method: "POST",
      path: "/api/developer/v1/posts",
      body: {
        platforms: ["instagram"],
        captionByPlatform: { instagram: "MCP test post" },
        status: "draft",
      },
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "call-1",
      result: {
        structuredContent: { post: { id: "post-1", status: "draft" } },
        content: [{ type: "text", text: expect.stringContaining("post-1") }],
      },
    })
  })

  it("returns JSON-RPC errors for unknown tools", async () => {
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "unknown", arguments: {} },
    }, {
      callDeveloperApi: async () => ({ ok: true }),
    })

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32602,
        message: "Unknown MCP tool: unknown",
      },
    })
  })
})
