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

  it("advertises content updates for draft or scheduled posts", () => {
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_update_draft_post",
      title: "Update draft or scheduled post",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          content: expect.objectContaining({ type: "string" }),
        }),
      }),
    }))
  })

  it("advertises media upload for post media URLs", () => {
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_upload_media",
      title: "Upload media",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          base64: expect.objectContaining({ type: "string" }),
          mimeType: expect.objectContaining({ type: "string" }),
          fileName: expect.objectContaining({ type: "string" }),
        }),
        required: ["base64"],
      }),
    }))
  })

  it("advertises automation discovery helpers and workflow graph fields", () => {
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_list_social_accounts",
      title: "List connected social accounts",
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_get_automation_node_catalog",
      title: "Get automation node catalog",
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_create_automation",
      inputSchema: expect.objectContaining({
        properties: expect.objectContaining({
          post_thumbnail_url: expect.objectContaining({ type: "string" }),
          post_caption: expect.objectContaining({ type: "string" }),
          workflow_graph: expect.objectContaining({
            description: expect.stringContaining("Trigger config must include social_account_id"),
          }),
          editor_version: expect.objectContaining({ enum: ["wizard", "canvas"] }),
        }),
      }),
    }))
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

  it("maps automation discovery tools to developer API requests", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-discovery",
      method: "tools/call",
      params: {
        name: "swiftflow_list_social_accounts",
        arguments: { platform: "instagram" },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { accounts: [{ id: "account-1", platform: "instagram" }] }
      },
    })

    expect(calls).toEqual([{
      method: "GET",
      path: "/api/developer/v1/social-accounts?platform=instagram",
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "automation-discovery",
      result: {
        structuredContent: { accounts: [{ id: "account-1", platform: "instagram" }] },
      },
    })
  })

  it("maps media uploads to the developer API media endpoint", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "media-upload",
      method: "tools/call",
      params: {
        name: "swiftflow_upload_media",
        arguments: {
          base64: "aGVsbG8=",
          mimeType: "image/png",
          fileName: "post.png",
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { publicUrl: "https://cdn.example.test/post_media/post.png" }
      },
    })

    expect(calls).toEqual([{
      method: "POST",
      path: "/api/developer/v1/media",
      body: {
        base64: "aGVsbG8=",
        mimeType: "image/png",
        fileName: "post.png",
      },
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "media-upload",
      result: {
        structuredContent: { publicUrl: "https://cdn.example.test/post_media/post.png" },
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
