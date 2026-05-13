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
      },
      "/posts/drafts": {
        get: {
          summary: "List draft and scheduled posts",
          description: "Required scope: posts:read",
          "x-required-scopes": ["posts:read"],
          responses: { "200": { description: "Post list" } },
        },
        post: {
          summary: "Create draft post",
          description: "Required scope: posts:draft:create. This endpoint never publishes directly.",
          "x-required-scopes": ["posts:draft:create"],
          responses: { "201": { description: "Draft post created" }, "400": { description: "Invalid payload" } },
        },
      },
      "/posts/drafts/{id}": {
        patch: {
          summary: "Update draft or scheduled post",
          description: "Required scope: posts:update. This endpoint never publishes directly.",
          "x-required-scopes": ["posts:update"],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
          responses: { "200": { description: "Post updated" }, "400": { description: "Invalid payload" } },
        },
      },
      "/analytics/summary": {
        get: {
          summary: "Read analytics summary",
          description: "Required scope: analytics:read",
          "x-required-scopes": ["analytics:read"],
          responses: { "200": { description: "Analytics summary" } },
        },
      },
      "/content-intelligence/analyze-post": {
        post: {
          summary: "Analyze draft content",
          description: "Required scope: content_intelligence:run",
          "x-required-scopes": ["content_intelligence:run"],
          responses: { "200": { description: "Content intelligence result" }, "429": { description: "Rate limited" } },
        },
      },
    },
  }
}
