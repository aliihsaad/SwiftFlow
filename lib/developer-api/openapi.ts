export function buildDeveloperApiOpenApiDocument(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "SwiftFlow Developer API",
      version: "1.0.0",
      description: "Workspace-scoped API for agent and automation clients. Send keys as Authorization: Bearer sf_live_...",
    },
    servers: [{ url: `${origin.replace(/\/$/, "")}/api/developer/v1` }],
    components: {
      securitySchemes: {
        DeveloperApiBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "SwiftFlow Developer API key",
        },
      },
    },
    security: [{ DeveloperApiBearer: [] }],
    paths: {
      "/workspace": {
        get: {
          summary: "Read workspace metadata",
          description: "Required scope: workspace:read",
          "x-required-scopes": ["workspace:read"],
          responses: { "200": { description: "Workspace metadata" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" }, "429": { description: "Rate limited" } },
        },
      },
      "/brand-profile": {
        get: {
          summary: "Read brand profile",
          description: "Required scope: brand:read",
          "x-required-scopes": ["brand:read"],
          responses: { "200": { description: "Brand profile" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" } },
        },
        put: {
          summary: "Update brand profile",
          description: "Required scope: brand:write",
          "x-required-scopes": ["brand:write"],
          responses: { "200": { description: "Updated brand profile" }, "400": { description: "Invalid payload" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" } },
        },
        patch: {
          summary: "Partially update brand profile",
          description: "Required scope: brand:write. Omitted fields are preserved.",
          "x-required-scopes": ["brand:write"],
          responses: { "200": { description: "Updated brand profile" }, "400": { description: "Invalid payload" }, "401": { description: "Unauthorized" }, "403": { description: "Forbidden" } },
        },
      },
      "/social-accounts": {
        get: {
          summary: "List connected social accounts",
          description: "Required scope: automations:read. Returns connected Instagram account ids for automation social_account_id and trigger node config.",
          "x-required-scopes": ["automations:read"],
          responses: { "200": { description: "Connected social account list" } },
        },
      },
      "/automation-node-catalog": {
        get: {
          summary: "Read automation node catalog",
          description: "Required scope: automations:read. Returns supported automation node types, graph shape guidance, and temporarily disabled nodes.",
          "x-required-scopes": ["automations:read"],
          responses: { "200": { description: "Automation node catalog" } },
        },
      },
      "/automation-templates": {
        get: {
          summary: "List automation templates",
          description: "Required scope: automations:read. Returns stable graph-backed templates, their trigger/action summary, required inputs, and optional configuration knobs. Prefer templates over raw workflow_graph creation for connector clients.",
          "x-required-scopes": ["automations:read"],
          responses: { "200": { description: "Automation template list" } },
        },
      },
      "/automation-media": {
        get: {
          summary: "List selectable automation media",
          description: "Required scope: automations:read. Returns recent Instagram media for a connected social account. Use returned media.id as trigger_new_comment config.post_id.",
          "x-required-scopes": ["automations:read"],
          parameters: [
            { name: "account_id", in: "query", required: true, schema: { type: "string", format: "uuid" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50, default: 25 } },
          ],
          responses: { "200": { description: "Selectable media list" }, "400": { description: "Invalid account id" }, "403": { description: "Missing Meta media permission" } },
        },
      },
      "/analytics/summary": {
        get: {
          summary: "Read analytics summary",
          description: "Required scope: analytics:read. Refreshes stale analytics cache before reading when possible.",
          "x-required-scopes": ["analytics:read"],
          responses: { "200": { description: "Analytics summary" } },
        },
      },
      "/automations": {
        get: {
          summary: "List automations",
          description: "Required scope: automations:read",
          "x-required-scopes": ["automations:read"],
          responses: { "200": { description: "Automation list" } },
        },
        post: {
          summary: "Create automation",
          description: "Required scope: automations:create. Preferred path: send template_id plus required inputs from /automation-templates and SwiftFlow compiles a graph-backed canvas automation. Advanced path: send a fully configured workflow_graph. Wizard/legacy mode is not accepted.",
          "x-required-scopes": ["automations:create"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["social_account_id", "name"],
                  properties: {
                    template_id: { type: "string", description: "Preferred. Template id from /automation-templates, for example tpl-reply-comments-ai." },
                    social_account_id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    is_active: { type: "boolean" },
                    post_id: { type: "string", description: "Required by comment-trigger templates." },
                    post_thumbnail_url: { type: "string" },
                    post_caption: { type: "string" },
                    delay_seconds: { type: "number", description: "Optional delay inserted after the trigger." },
                    ai_tone: { type: "string", enum: ["friendly", "professional", "playful", "empathetic", "sales"] },
                    ai_length: { type: "string", enum: ["short", "medium", "long"] },
                    ai_custom_instructions: { type: "string" },
                    editor_version: { type: "string", enum: ["canvas"] },
                    workflow_graph: {
                      type: "object",
                      description: "Advanced. React Flow graph with nodes and edges. Trigger config must include social_account_id; trigger_new_comment also requires post_id.",
                    },
                  },
                },
              },
            },
          },
          responses: { "201": { description: "Automation created" }, "400": { description: "Invalid payload" } },
        },
      },
      "/automations/{id}": {
        get: {
          summary: "Read automation",
          description: "Required scope: automations:read",
          "x-required-scopes": ["automations:read"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Automation" }, "404": { description: "Not found" } },
        },
        patch: {
          summary: "Update automation",
          description: "Required scope: automations:update. workflow_graph updates are validated and remain graph-backed canvas automations.",
          "x-required-scopes": ["automations:update"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Automation updated" } },
        },
        delete: {
          summary: "Delete automation",
          description: "Required scope: automations:delete",
          "x-required-scopes": ["automations:delete"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Automation deleted" } },
        },
      },
      "/automations/{id}/toggle": {
        post: {
          summary: "Activate or disable automation",
          description: "Required scope: automations:toggle",
          "x-required-scopes": ["automations:toggle"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Automation active state updated" }, "400": { description: "Invalid payload" } },
        },
      },
    },
  }
}
