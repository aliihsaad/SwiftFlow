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
      name: "swiftflow_list_automation_media",
      title: "List automation media",
      inputSchema: expect.objectContaining({
        required: ["social_account_id"],
      }),
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_list_automation_templates",
      title: "List automation templates",
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_get_automation_node_catalog",
      title: "Get automation node catalog",
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_create_automation_from_template",
      inputSchema: expect.objectContaining({
        required: ["template_id", "social_account_id", "name"],
        properties: expect.objectContaining({
          template_id: expect.objectContaining({ type: "string" }),
          delay_seconds: expect.objectContaining({ type: "number" }),
        }),
      }),
    }))
    expect(DEVELOPER_MCP_TOOLS).toContainEqual(expect.objectContaining({
      name: "swiftflow_create_automation",
      inputSchema: expect.objectContaining({
        required: ["social_account_id", "name", "workflow_graph"],
        properties: expect.objectContaining({
          post_thumbnail_url: expect.objectContaining({ type: "string" }),
          post_caption: expect.objectContaining({ type: "string" }),
          workflow_graph: expect.objectContaining({
            description: expect.stringContaining("Trigger config must include social_account_id"),
          }),
          editor_version: expect.objectContaining({ enum: ["canvas"] }),
        }),
      }),
    }))
  })

  it("forces MCP-created automations into graph-backed canvas mode", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const workflowGraph = {
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          position: { x: 0, y: 0 },
          data: {
            type: "trigger_new_comment",
            label: "New Comment",
            config: {
              social_account_id: "11111111-1111-4111-8111-111111111111",
              post_id: "17895695668004550",
              trigger_type: "any",
              keywords: [],
            },
          },
        },
      ],
      edges: [],
    }

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-create",
      method: "tools/call",
      params: {
        name: "swiftflow_create_automation",
        arguments: {
          social_account_id: "11111111-1111-4111-8111-111111111111",
          name: "Comment AI reply",
          editor_version: "wizard",
          workflow_graph: workflowGraph,
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
        social_account_id: "11111111-1111-4111-8111-111111111111",
        name: "Comment AI reply",
        editor_version: "canvas",
        workflow_graph: workflowGraph,
      },
    }])
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

  it("maps automation media discovery to selectable trigger post ids", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-media",
      method: "tools/call",
      params: {
        name: "swiftflow_list_automation_media",
        arguments: {
          social_account_id: "11111111-1111-4111-8111-111111111111",
          limit: 5,
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { media: [{ id: "17895695668004550", caption: "Latest post" }] }
      },
    })

    expect(calls).toEqual([{
      method: "GET",
      path: "/api/developer/v1/automation-media?account_id=11111111-1111-4111-8111-111111111111&limit=5",
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "automation-media",
      result: {
        structuredContent: { media: [{ id: "17895695668004550", caption: "Latest post" }] },
      },
    })
  })

  it("maps template automation creation to the developer API create route", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "template-create",
      method: "tools/call",
      params: {
        name: "swiftflow_create_automation_from_template",
        arguments: {
          template_id: "tpl-reply-comments-ai",
          social_account_id: "11111111-1111-4111-8111-111111111111",
          name: "Template AI reply",
          post_id: "17895695668004550",
          delay_seconds: 30,
        },
      },
    }, {
      callDeveloperApi: async (request) => {
        calls.push(request)
        return { automation: { id: "automation-1", editor_version: "canvas" } }
      },
    })

    expect(calls).toEqual([{
      method: "POST",
      path: "/api/developer/v1/automations",
      body: {
        template_id: "tpl-reply-comments-ai",
        social_account_id: "11111111-1111-4111-8111-111111111111",
        name: "Template AI reply",
        post_id: "17895695668004550",
        delay_seconds: 30,
        editor_version: "canvas",
      },
    }])
    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "template-create",
      result: {
        structuredContent: { automation: { id: "automation-1", editor_version: "canvas" } },
      },
    })
  })

  it("maps automation update, toggle, and delete tools to developer API requests", async () => {
    const calls: DeveloperMcpApiRequest[] = []
    const context = {
      callDeveloperApi: async (request: DeveloperMcpApiRequest) => {
        calls.push(request)
        return { ok: true }
      },
    }

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-update",
      method: "tools/call",
      params: {
        name: "swiftflow_update_automation",
        arguments: {
          id: "33333333-3333-4333-8333-333333333333",
          template_id: "tpl-reply-comments-ai",
          name: "Updated template automation",
          post_id: "17895695668004551",
          delay_seconds: 45,
        },
      },
    }, context)

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-toggle",
      method: "tools/call",
      params: {
        name: "swiftflow_toggle_automation",
        arguments: {
          id: "33333333-3333-4333-8333-333333333333",
          is_active: false,
        },
      },
    }, context)

    await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-delete",
      method: "tools/call",
      params: {
        name: "swiftflow_delete_automation",
        arguments: {
          id: "33333333-3333-4333-8333-333333333333",
        },
      },
    }, context)

    expect(calls).toEqual([
      {
        method: "PATCH",
        path: "/api/developer/v1/automations/33333333-3333-4333-8333-333333333333",
        body: {
          template_id: "tpl-reply-comments-ai",
          name: "Updated template automation",
          post_id: "17895695668004551",
          delay_seconds: 45,
          editor_version: "canvas",
        },
      },
      {
        method: "POST",
        path: "/api/developer/v1/automations/33333333-3333-4333-8333-333333333333/toggle",
        body: { is_active: false },
      },
      {
        method: "DELETE",
        path: "/api/developer/v1/automations/33333333-3333-4333-8333-333333333333",
      },
    ])
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

  it("includes backend validation payloads in MCP tool errors", async () => {
    const error = new Error("Developer API request failed with 400") as Error & {
      payload: unknown
    }
    error.payload = {
      error: "Invalid workflow_graph",
      validationErrors: [
        {
          code: "MISSING_FIELD",
          message: "Delay requires a positive duration_value.",
          nodeId: "delay",
        },
      ],
    }

    const response = await handleDeveloperMcpJsonRpc({
      jsonrpc: "2.0",
      id: "automation-create",
      method: "tools/call",
      params: {
        name: "swiftflow_create_automation",
        arguments: {
          social_account_id: "11111111-1111-4111-8111-111111111111",
          name: "Bad delay",
          workflow_graph: { nodes: [], edges: [] },
        },
      },
    }, {
      callDeveloperApi: async () => {
        throw error
      },
    })

    expect(response).toEqual({
      jsonrpc: "2.0",
      id: "automation-create",
      error: {
        code: -32603,
        message: "Developer API request failed with 400",
        data: error.payload,
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
