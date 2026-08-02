import { describe, expect, it } from "vitest"
import {
  DEVELOPER_MCP_TOOLS,
  handleDeveloperMcpJsonRpc,
  type DeveloperMcpApiRequest,
} from "@/lib/developer-api/mcp"

describe("developer API MCP bridge", () => {
  it("advertises engagement and analytics tools without publishing tools", async () => {
    const names = DEVELOPER_MCP_TOOLS.map((tool) => tool.name)
    expect(names).toContain("swiftflow_get_workspace")
    expect(names).toContain("swiftflow_create_automation")
    expect(names).toContain("swiftflow_toggle_automation")
    expect(names).toContain("swiftflow_get_analytics_summary")
    expect(names).not.toContain("swiftflow_create_post")
    expect(names).not.toContain("swiftflow_generate_post_image")
    expect(names).not.toContain("swiftflow_upload_media")

    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, {
      callDeveloperApi: async () => ({ ok: true }),
    })
    expect(response).toMatchObject({ jsonrpc: "2.0", id: 1 })
  })

  it("marks every tool with auth and safety annotations", () => {
    for (const tool of DEVELOPER_MCP_TOOLS) {
      expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["swiftflow.developer_api"] }])
      expect(tool.annotations).toMatchObject({
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean),
      })
    }
  })

  it("forces MCP-created automations into graph-backed canvas mode", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const graph = {
      nodes: [{
        id: "trigger-1",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger_new_comment",
          label: "New Comment",
          config: { social_account_id: "account-1", trigger_type: "any", keywords: [] },
        },
      }],
      edges: [],
    }

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "create",
      method: "tools/call",
      params: {
        name: "swiftflow_create_automation",
        arguments: {
          social_account_id: "account-1",
          name: "Comment reply",
          editor_version: "wizard",
          workflow_graph: graph,
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { automation: { id: "automation-1" } }
      },
    })

    expect(calls).toEqual([{
      method: "POST",
      path: "/api/developer/v1/automations",
      body: {
        social_account_id: "account-1",
        name: "Comment reply",
        editor_version: "canvas",
        workflow_graph: graph,
      },
    }])
  })

  it("maps automation discovery and analytics tools", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const context = {
      callDeveloperApi: async (request: DeveloperMcpApiRequest) => {
        calls.push(request)
        return { ok: true }
      },
    }

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "accounts",
      method: "tools/call",
      params: { name: "swiftflow_list_social_accounts", arguments: { platform: "instagram" } },
    }, context)
    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "analytics",
      method: "tools/call",
      params: { name: "swiftflow_get_analytics_summary", arguments: {} },
    }, context)

    expect(calls).toEqual([
      { method: "GET", path: "/api/developer/v1/social-accounts?platform=instagram" },
      { method: "GET", path: "/api/developer/v1/analytics/summary" },
    ])
  })

  it("returns a JSON-RPC error for unknown tools", async () => {
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
      error: { code: -32602, message: "Unknown MCP tool: unknown" },
    })
  })
})
