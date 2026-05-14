import { getDeveloperOAuthScope } from "./oauth"

type JsonRpcId = string | number | null

type JsonRpcRequest = {
  jsonrpc: "2.0"
  id?: JsonRpcId
  method?: string
  params?: unknown
}

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId; error: { code: number; message: string; data?: unknown } }

type JsonSchema = {
  type: "object"
  properties?: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

type DeveloperMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  securitySchemes?: { type: "oauth2"; scopes: string[] }[]
  _meta?: {
    securitySchemes?: { type: "oauth2"; scopes: string[] }[]
    [key: string]: unknown
  }
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
    openWorldHint?: boolean
  }
}

export type DeveloperMcpApiRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  path: string
  body?: unknown
}

type DeveloperMcpContext = {
  callDeveloperApi: (request: DeveloperMcpApiRequest) => Promise<unknown>
}

const EMPTY_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
}

const ID_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    id: { type: "string", description: "Workspace resource UUID." },
  },
  required: ["id"],
  additionalProperties: false,
}

const OAUTH_SECURITY_SCHEMES = [{ type: "oauth2" as const, scopes: [getDeveloperOAuthScope()] }]
const WORKFLOW_GRAPH_SCHEMA = {
  type: "object",
  description: "Advanced escape hatch only. Prefer swiftflow_create_automation_from_template for normal connector-created automations. Required graph-backed automation workflow with { nodes, edges }. Each node data must include type, label, and a fully configured config object. Supported live trigger types are trigger_new_comment, trigger_new_message, and trigger_story_reply. Trigger config must include social_account_id; trigger_new_comment also needs post_id. action_delay config uses duration_value and duration_unit. action_reply_comment must set use_ai_response true or include a real fallback message.",
  additionalProperties: true,
}

function secureTool(tool: Omit<DeveloperMcpTool, "securitySchemes" | "_meta">): DeveloperMcpTool {
  return {
    ...tool,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      ...tool.annotations,
    },
    securitySchemes: OAUTH_SECURITY_SCHEMES,
    _meta: {
      securitySchemes: OAUTH_SECURITY_SCHEMES,
    },
  }
}

export const DEVELOPER_MCP_TOOLS: DeveloperMcpTool[] = [
  secureTool({
    name: "swiftflow_get_workspace",
    title: "Get workspace",
    description: "Read the current SwiftFlow workspace metadata for this API key.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_get_brand_profile",
    title: "Get brand profile",
    description: "Read the workspace brand profile used for content and automation generation.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_update_brand_profile",
    title: "Update brand profile",
    description: "Partially update the workspace brand profile. Omitted fields are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        business_name: { type: "string" },
        owner_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        industry: { type: "string" },
        business_description: { type: "string" },
        target_audience: { type: "string" },
        brand_voice: { type: "string" },
        language: { type: "string" },
        services: { type: "array", items: { type: "string" } },
        unique_selling_points: { type: "array", items: { type: "string" } },
        brand_colors: { type: "object", additionalProperties: true },
        content_themes: { type: "array", items: { type: "string" } },
      },
      additionalProperties: true,
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_list_posts",
    title: "List posts",
    description: "List recent draft, scheduled, published, and failed posts in the workspace.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_create_post",
    title: "Create post",
    description: "Create a draft, scheduled post, or immediate publish request. Use status draft, scheduled, or published.",
    inputSchema: {
      type: "object",
      properties: {
        platforms: {
          type: "array",
          items: { type: "string", enum: ["instagram", "facebook"] },
          minItems: 1,
        },
        captionByPlatform: {
          type: "object",
          properties: {
            instagram: { type: "string" },
            facebook: { type: "string" },
          },
          additionalProperties: false,
        },
        mediaUrls: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["draft", "scheduled", "published"] },
        scheduledAt: { type: "string", description: "ISO timestamp. Required when status is scheduled." },
      },
      required: ["platforms", "captionByPlatform"],
      additionalProperties: false,
    },
    annotations: { openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_update_draft_post",
    title: "Update draft or scheduled post",
    description: "Update an existing draft or scheduled post by id. Use content as a shortcut for the main caption, or captionByPlatform for per-platform captions.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string", description: "Shortcut for updating the main post caption." },
        platforms: { type: "array", items: { type: "string", enum: ["instagram", "facebook"] } },
        captionByPlatform: { type: "object", additionalProperties: true },
        mediaUrls: { type: "array", items: { type: "string" } },
        status: { type: "string", enum: ["draft", "scheduled"] },
        scheduledAt: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_delete_draft_post",
    title: "Delete draft or scheduled post",
    description: "Delete a draft or scheduled post by id. Ask the user before using this tool.",
    inputSchema: ID_INPUT_SCHEMA,
    annotations: { destructiveHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_upload_media",
    title: "Upload media",
    description: "Upload base64 image or video media into SwiftFlow post_media storage and return a public URL that can be used in post mediaUrls.",
    inputSchema: {
      type: "object",
      properties: {
        base64: { type: "string", description: "Raw base64 media or a data URL like data:image/png;base64,..." },
        mimeType: { type: "string", description: "Required for raw base64. Supported examples: image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm." },
        fileName: { type: "string", description: "Optional original filename for context." },
      },
      required: ["base64"],
      additionalProperties: false,
    },
    annotations: { openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_list_automations",
    title: "List automations",
    description: "List workspace automations and their active state.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_list_social_accounts",
    title: "List connected social accounts",
    description: "List connected Instagram and Facebook account ids that can be used in automation trigger nodes and social_account_id fields.",
    inputSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["instagram", "facebook"], description: "Optional platform filter." },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_list_automation_media",
    title: "List automation media",
    description: "List recent Instagram media or Facebook Page posts for a connected social account. Use returned media.id as trigger_new_comment config.post_id when creating comment automations.",
    inputSchema: {
      type: "object",
      properties: {
        social_account_id: { type: "string", description: "Connected social account UUID from swiftflow_list_social_accounts." },
        limit: { type: "number", description: "Optional result limit. Defaults to 25, max 50." },
      },
      required: ["social_account_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_list_automation_templates",
    title: "List automation templates",
    description: "List stable SwiftFlow automation templates. Prefer these templates over raw workflow_graph creation because SwiftFlow compiles the known-good canvas nodes.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_get_automation_node_catalog",
    title: "Get automation node catalog",
    description: "Read the supported automation node types, graph shape, and disabled node types before creating or editing workflow_graph.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_get_automation",
    title: "Get automation",
    description: "Read one automation by id.",
    inputSchema: ID_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_create_automation_from_template",
    title: "Create automation from template",
    description: "Create a configured graph-backed automation by applying user inputs to a stable SwiftFlow template. Use this instead of raw workflow_graph creation for normal ChatGPT, Claude, or Codex connector workflows.",
    inputSchema: {
      type: "object",
      properties: {
        template_id: { type: "string", description: "Template id from swiftflow_list_automation_templates, for example tpl-reply-comments-ai." },
        social_account_id: { type: "string", description: "Connected social account UUID." },
        name: { type: "string" },
        is_active: { type: "boolean" },
        post_id: { type: "string", description: "Meta Instagram media or Facebook page post id for comment templates." },
        post_thumbnail_url: { type: "string" },
        post_caption: { type: "string" },
        delay_seconds: { type: "number", description: "Optional delay inserted after the trigger before actions run." },
        ai_tone: { type: "string", enum: ["friendly", "professional", "playful", "empathetic", "sales"] },
        ai_length: { type: "string", enum: ["short", "medium", "long"] },
        ai_custom_instructions: { type: "string" },
        reply_messages: { type: "array", items: { type: "string" } },
        dm_opening_message: { type: "string" },
        dm_button_text: { type: "string" },
        dm_link_url: { type: "string" },
        dm_link_message: { type: "string" },
      },
      required: ["template_id", "social_account_id", "name"],
      additionalProperties: false,
    },
    annotations: { openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_create_automation",
    title: "Create automation",
    description: "Advanced: create a graph-backed canvas automation for a connected social account from a raw workflow_graph. Prefer swiftflow_create_automation_from_template unless the user explicitly needs custom nodes.",
    inputSchema: {
      type: "object",
      properties: {
        social_account_id: { type: "string" },
        name: { type: "string" },
        type: { type: "string" },
        is_active: { type: "boolean" },
        platform_post_id: { type: "string" },
        post_thumbnail_url: { type: "string" },
        post_caption: { type: "string" },
        trigger_config: { type: "object", additionalProperties: true },
        comment_reply_config: { type: "object", additionalProperties: true },
        dm_config: { type: "object", additionalProperties: true },
        workflow_graph: WORKFLOW_GRAPH_SCHEMA,
        editor_version: { type: "string", enum: ["canvas"] },
      },
      required: ["social_account_id", "name", "workflow_graph"],
      additionalProperties: true,
    },
    annotations: { openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_update_automation",
    title: "Update automation",
    description: "Update an existing graph-backed canvas automation by id. Send a fully configured workflow_graph when changing nodes. Wizard/legacy editor mode is not accepted through MCP.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        template_id: { type: "string", description: "Optional template id from swiftflow_list_automation_templates. When provided, SwiftFlow recompiles the canvas graph from this stable template." },
        social_account_id: { type: "string", description: "Optional connected social account UUID. Defaults to the automation's existing account for template updates." },
        name: { type: "string" },
        is_active: { type: "boolean" },
        post_id: { type: "string", description: "Meta Instagram media or Facebook page post id for comment templates." },
        platform_post_id: { type: "string" },
        post_thumbnail_url: { type: "string" },
        post_caption: { type: "string" },
        delay_seconds: { type: "number", description: "Optional delay inserted after the trigger before actions run when using template_id." },
        ai_tone: { type: "string", enum: ["friendly", "professional", "playful", "empathetic", "sales"] },
        ai_length: { type: "string", enum: ["short", "medium", "long"] },
        ai_custom_instructions: { type: "string" },
        reply_messages: { type: "array", items: { type: "string" } },
        dm_opening_message: { type: "string" },
        dm_button_text: { type: "string" },
        dm_link_url: { type: "string" },
        dm_link_message: { type: "string" },
        trigger_config: { type: "object", additionalProperties: true },
        comment_reply_config: { type: "object", additionalProperties: true },
        dm_config: { type: "object", additionalProperties: true },
        workflow_graph: WORKFLOW_GRAPH_SCHEMA,
        editor_version: { type: "string", enum: ["canvas"] },
      },
      required: ["id"],
      additionalProperties: true,
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_toggle_automation",
    title: "Activate or disable automation",
    description: "Turn an automation on or off by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        is_active: { type: "boolean" },
      },
      required: ["id", "is_active"],
      additionalProperties: false,
    },
    annotations: { idempotentHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_delete_automation",
    title: "Delete automation",
    description: "Delete an automation by id. Ask the user before using this tool.",
    inputSchema: ID_INPUT_SCHEMA,
    annotations: { destructiveHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_get_analytics_summary",
    title: "Get analytics summary",
    description: "Read aggregate workspace analytics and recent account analytics.",
    inputSchema: EMPTY_INPUT_SCHEMA,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
  secureTool({
    name: "swiftflow_analyze_post_content",
    title: "Analyze post content",
    description: "Run content intelligence on a caption and optional media/schedule context.",
    inputSchema: {
      type: "object",
      properties: {
        caption: { type: "string" },
        platforms: { type: "array", items: { type: "string", enum: ["instagram", "facebook"] } },
        mediaUrls: { type: "array", items: { type: "string" } },
        scheduledAt: { type: "string" },
      },
      required: ["caption"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }),
]

const TOOL_BY_NAME = new Map(DEVELOPER_MCP_TOOLS.map((tool) => [tool.name, tool]))

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result }
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } }
}

function objectArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value.trim()
}

function bodyWithoutId(args: Record<string, unknown>): Record<string, unknown> {
  const body = { ...args }
  delete body.id
  return body
}

function automationBody(args: Record<string, unknown>): Record<string, unknown> {
  return { ...args, editor_version: "canvas" }
}

function mapToolCall(name: string, rawArgs: unknown): DeveloperMcpApiRequest {
  const args = objectArgs(rawArgs)

  switch (name) {
    case "swiftflow_get_workspace":
      return { method: "GET", path: "/api/developer/v1/workspace" }
    case "swiftflow_get_brand_profile":
      return { method: "GET", path: "/api/developer/v1/brand-profile" }
    case "swiftflow_update_brand_profile":
      return { method: "PATCH", path: "/api/developer/v1/brand-profile", body: args }
    case "swiftflow_list_posts":
      return { method: "GET", path: "/api/developer/v1/posts" }
    case "swiftflow_create_post":
      return { method: "POST", path: "/api/developer/v1/posts", body: args }
    case "swiftflow_update_draft_post": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "PATCH", path: `/api/developer/v1/posts/drafts/${id}`, body: bodyWithoutId(args) }
    }
    case "swiftflow_delete_draft_post": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "DELETE", path: `/api/developer/v1/posts/drafts/${id}` }
    }
    case "swiftflow_upload_media":
      return { method: "POST", path: "/api/developer/v1/media", body: args }
    case "swiftflow_list_automations":
      return { method: "GET", path: "/api/developer/v1/automations" }
    case "swiftflow_list_social_accounts": {
      const platform = typeof args.platform === "string" && ["instagram", "facebook"].includes(args.platform)
        ? `?platform=${encodeURIComponent(args.platform)}`
        : ""
      return { method: "GET", path: `/api/developer/v1/social-accounts${platform}` }
    }
    case "swiftflow_list_automation_media": {
      const accountId = encodeURIComponent(requiredString(args, "social_account_id"))
      const limit = typeof args.limit === "number" && Number.isFinite(args.limit)
        ? `&limit=${encodeURIComponent(String(Math.max(1, Math.min(50, Math.floor(args.limit))))) }`
        : ""
      return { method: "GET", path: `/api/developer/v1/automation-media?account_id=${accountId}${limit}` }
    }
    case "swiftflow_list_automation_templates":
      return { method: "GET", path: "/api/developer/v1/automation-templates" }
    case "swiftflow_get_automation_node_catalog":
      return { method: "GET", path: "/api/developer/v1/automation-node-catalog" }
    case "swiftflow_get_automation": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "GET", path: `/api/developer/v1/automations/${id}` }
    }
    case "swiftflow_create_automation":
      return { method: "POST", path: "/api/developer/v1/automations", body: automationBody(args) }
    case "swiftflow_create_automation_from_template":
      return { method: "POST", path: "/api/developer/v1/automations", body: automationBody(args) }
    case "swiftflow_update_automation": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "PATCH", path: `/api/developer/v1/automations/${id}`, body: automationBody(bodyWithoutId(args)) }
    }
    case "swiftflow_toggle_automation": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "POST", path: `/api/developer/v1/automations/${id}/toggle`, body: bodyWithoutId(args) }
    }
    case "swiftflow_delete_automation": {
      const id = encodeURIComponent(requiredString(args, "id"))
      return { method: "DELETE", path: `/api/developer/v1/automations/${id}` }
    }
    case "swiftflow_get_analytics_summary":
      return { method: "GET", path: "/api/developer/v1/analytics/summary" }
    case "swiftflow_analyze_post_content":
      return { method: "POST", path: "/api/developer/v1/content-intelligence/analyze-post", body: args }
    default:
      throw new Error(`Unknown MCP tool: ${name}`)
  }
}

function toolResult(payload: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  }
}

export async function handleDeveloperMcpJsonRpc(
  message: JsonRpcRequest,
  context: DeveloperMcpContext,
): Promise<JsonRpcResponse | null> {
  const id = message.id ?? null
  if (!message.id && message.method?.startsWith("notifications/")) return null

  try {
    switch (message.method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: {
            name: "swiftflow-developer-api",
            title: "SwiftFlow Developer API",
            version: "0.1.0",
          },
        })
      case "tools/list":
        return jsonRpcResult(id, { tools: DEVELOPER_MCP_TOOLS })
      case "tools/call": {
        const params = objectArgs(message.params)
        const name = typeof params.name === "string" ? params.name : ""
        if (!TOOL_BY_NAME.has(name)) {
          return jsonRpcError(id, -32602, `Unknown MCP tool: ${name || "missing"}`)
        }
        const apiRequest = mapToolCall(name, params.arguments)
        const payload = await context.callDeveloperApi(apiRequest)
        return jsonRpcResult(id, toolResult(payload))
      }
      default:
        return jsonRpcError(id, -32601, `Unsupported MCP method: ${message.method || "missing"}`)
    }
  } catch (error) {
    const data = error && typeof error === "object" && "payload" in error
      ? (error as { payload?: unknown }).payload
      : undefined
    return jsonRpcError(id, -32603, error instanceof Error ? error.message : "MCP bridge error", data)
  }
}
