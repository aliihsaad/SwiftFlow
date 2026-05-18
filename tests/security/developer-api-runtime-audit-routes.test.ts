import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111"
const POST_ID = "22222222-2222-4222-8222-222222222222"
const POST_ID_2 = "33333333-3333-4333-8333-333333333333"
const AUTOMATION_ID = "44444444-4444-4444-8444-444444444444"
const ACCOUNT_ID = "55555555-5555-4555-8555-555555555555"
const ORIGIN = "https://social.swiftdigital-s.com"

const state = vi.hoisted(() => ({
  auditCalls: [] as Array<Record<string, unknown>>,
  requiredScopeCalls: [] as string[][],
  posts: [] as Array<Record<string, unknown>>,
  brandProfiles: [] as Array<Record<string, unknown>>,
  socialAccounts: [] as Array<Record<string, unknown>>,
  automations: [] as Array<Record<string, unknown>>,
  uploads: [] as Array<Record<string, unknown>>,
  functionInvocations: [] as Array<{ name: string; body?: Record<string, unknown> }>,
}))

vi.mock("@/lib/developer-api/auth", () => {
  class DeveloperApiAuthError extends Error {
    readonly status: number
    readonly code: string
    readonly keyPrefix: string | null

    constructor(message: string, status: number, code: string, keyPrefix: string | null = null) {
      super(message)
      this.name = "DeveloperApiAuthError"
      this.status = status
      this.code = code
      this.keyPrefix = keyPrefix
    }
  }

  return {
    DeveloperApiAuthError,
    authenticateDeveloperApiRequest: async (_request: Request, requiredScopes: string[]) => {
      state.requiredScopeCalls.push([...requiredScopes])
      return {
        workspaceId: WORKSPACE_ID,
        apiKeyId: "api-key-1",
        keyPrefix: "sf_live_testprefix1",
        scopes: requiredScopes,
        roleSnapshot: "owner",
      }
    },
  }
})

vi.mock("@/lib/developer-api/audit", () => ({
  getDeveloperApiRequestId: () => "req_phase1_route_audit",
  writeDeveloperApiAuditLog: async (params: Record<string, unknown>) => {
    state.auditCalls.push(params)
  },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createQuery(table),
    functions: {
      invoke: async (name: string, options?: { body?: Record<string, unknown> }) => {
        state.functionInvocations.push({ name, body: options?.body })
        return {
          data: {
            result: {
              imageUrl: "data:image/png;base64,aW1hZ2U=",
              model: "test-image-model",
              prompt_used: "Generated prompt",
            },
          },
          error: null,
        }
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, options: Record<string, unknown>) => {
          state.uploads.push({ bucket, path, bytes: body.byteLength, ...options })
          return { data: { path }, error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example.com/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
  }),
}))

function rowsForTable(table: string) {
  if (table === "posts") return state.posts
  if (table === "workspace_brand_profiles") return state.brandProfiles
  if (table === "social_accounts") return state.socialAccounts
  if (table === "automations") return state.automations
  return []
}

function createQuery(table: string) {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, unknown[]> = {}
  let operation: "select" | "insert" | "update" | "delete" = "select"
  let insertPayload: Record<string, unknown> | null = null
  let updatePayload: Record<string, unknown> | null = null

  const matches = (row: Record<string, unknown>) => (
    Object.entries(filters).every(([key, value]) => row[key] === value) &&
    Object.entries(inFilters).every(([key, values]) => values.includes(row[key]))
  )
  const findIndex = () => rowsForTable(table).findIndex(matches)

  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    in: vi.fn((key: string, values: unknown[]) => {
      inFilters[key] = values
      return query
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      operation = "insert"
      insertPayload = payload
      return query
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      operation = "update"
      updatePayload = payload
      return query
    }),
    delete: vi.fn(() => {
      operation = "delete"
      return query
    }),
    maybeSingle: vi.fn(async () => {
      const row = rowsForTable(table).find(matches)
      return { data: row ? { ...row } : null, error: null }
    }),
    single: vi.fn(async () => {
      const rows = rowsForTable(table)
      if (operation === "insert" && insertPayload) {
        const row = {
          id: table === "automations" ? AUTOMATION_ID : `${table}-${rows.length + 1}`,
          created_at: "2026-05-18T00:00:00.000Z",
          updated_at: "2026-05-18T00:00:00.000Z",
          ...insertPayload,
        }
        rows.unshift(row)
        return { data: { ...row }, error: null }
      }

      const index = findIndex()
      if (index < 0) return { data: null, error: { message: "No rows found" } }

      if (operation === "update" && updatePayload) {
        rows[index] = { ...rows[index], ...updatePayload }
      } else if (operation === "delete") {
        const [deleted] = rows.splice(index, 1)
        return { data: { ...deleted }, error: null }
      }

      return { data: { ...rows[index] }, error: null }
    }),
  }

  return query
}

function request(path: string, method: string, body?: Record<string, unknown>) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

function postPayload(status: "draft" | "scheduled" | "published", scheduledAt?: string) {
  return {
    platforms: ["instagram"],
    captionByPlatform: { instagram: `${status} caption` },
    mediaUrls: ["https://cdn.example.com/post.png"],
    status,
    scheduledAt,
  }
}

function validAutomationGraph() {
  return {
    nodes: [
      {
        id: "trigger-comment",
        type: "trigger",
        position: { x: 0, y: 0 },
        data: {
          type: "trigger_new_comment",
          label: "New Comment",
          config: {
            social_account_id: ACCOUNT_ID,
            post_id: "17895695668004550",
            trigger_type: "any",
            keywords: [],
          },
        },
      },
      {
        id: "reply",
        type: "action",
        position: { x: 200, y: 0 },
        data: {
          type: "action_reply_comment",
          label: "Reply",
          config: {
            use_ai_response: false,
            messages: ["Thanks for the comment"],
          },
        },
      },
    ],
    edges: [{ id: "edge-1", source: "trigger-comment", target: "reply" }],
  }
}

import * as postsRoute from "@/app/api/developer/v1/posts/route"
import * as draftByIdRoute from "@/app/api/developer/v1/posts/drafts/[id]/route"
import * as brandProfileRoute from "@/app/api/developer/v1/brand-profile/route"
import * as mediaRoute from "@/app/api/developer/v1/media/route"
import * as mediaGenerateRoute from "@/app/api/developer/v1/media/generate/route"
import * as automationsRoute from "@/app/api/developer/v1/automations/route"
import * as automationByIdRoute from "@/app/api/developer/v1/automations/[id]/route"
import * as automationToggleRoute from "@/app/api/developer/v1/automations/[id]/toggle/route"

describe("Developer API runtime route audit integration", () => {
  beforeEach(() => {
    state.auditCalls = []
    state.requiredScopeCalls = []
    state.uploads = []
    state.functionInvocations = []
    state.posts = [
      {
        id: POST_ID,
        workspace_id: WORKSPACE_ID,
        content: "Original draft",
        media_urls: ["https://cdn.example.com/original.png"],
        platforms: ["instagram"],
        status: "draft",
        scheduled_for: null,
        published_at: null,
      },
      {
        id: POST_ID_2,
        workspace_id: WORKSPACE_ID,
        content: "Delete draft",
        media_urls: [],
        platforms: ["instagram"],
        status: "draft",
        scheduled_for: null,
        published_at: null,
      },
    ]
    state.brandProfiles = []
    state.socialAccounts = [{ id: ACCOUNT_ID, workspace_id: WORKSPACE_ID, platform: "instagram" }]
    state.automations = [{
      id: AUTOMATION_ID,
      workspace_id: WORKSPACE_ID,
      social_account_id: ACCOUNT_ID,
      name: "Existing automation",
      editor_version: "canvas",
      workflow_graph: validAutomationGraph(),
      is_active: true,
      platform_post_id: "17895695668004550",
    }]
  })

  it("writes route-specific audit records for high-risk write actions", async () => {
    const responses = [
      await postsRoute.POST(request("/api/developer/v1/posts", "POST", postPayload("draft"))),
      await postsRoute.POST(request("/api/developer/v1/posts", "POST", postPayload("scheduled", "2026-06-01T12:00:00.000Z"))),
      await postsRoute.POST(request("/api/developer/v1/posts", "POST", postPayload("published"))),
      await draftByIdRoute.PATCH(request(`/api/developer/v1/posts/drafts/${POST_ID}`, "PATCH", {
        content: "Updated draft",
      }), { params: Promise.resolve({ id: POST_ID }) }),
      await draftByIdRoute.DELETE(request(`/api/developer/v1/posts/drafts/${POST_ID_2}`, "DELETE"), { params: Promise.resolve({ id: POST_ID_2 }) }),
      await brandProfileRoute.PUT(request("/api/developer/v1/brand-profile", "PUT", {
        business_name: "AIdevlab",
        owner_name: "Owner",
        email: "owner@example.com",
        phone: "",
        website: "https://example.com",
        industry: "AI SaaS",
        business_description: "Builds AI apps",
        target_audience: "Founders",
        brand_voice: "professional",
        language: "en",
        services: [],
        unique_selling_points: [],
        logo_url: "",
        brand_colors: { enabled: true, primary: "#050505", secondary: "#A1A1AA", accent: "#00E5FF" },
        reference_image_urls: [],
        instagram_handle: "",
        facebook_page: "",
        content_themes: [],
      })),
      await mediaRoute.POST(request("/api/developer/v1/media", "POST", {
        base64: Buffer.from("upload").toString("base64"),
        mimeType: "image/png",
      })),
      await mediaGenerateRoute.POST(request("/api/developer/v1/media/generate", "POST", {
        prompt: "Create a launch image",
      })),
      await automationsRoute.POST(request("/api/developer/v1/automations", "POST", {
        social_account_id: ACCOUNT_ID,
        name: "Created automation",
        workflow_graph: validAutomationGraph(),
      })),
      await automationByIdRoute.PATCH(request(`/api/developer/v1/automations/${AUTOMATION_ID}`, "PATCH", {
        name: "Updated automation",
      }), { params: Promise.resolve({ id: AUTOMATION_ID }) }),
      await automationToggleRoute.POST(request(`/api/developer/v1/automations/${AUTOMATION_ID}/toggle`, "POST", {
        is_active: false,
      }), { params: Promise.resolve({ id: AUTOMATION_ID }) }),
      await automationByIdRoute.DELETE(request(`/api/developer/v1/automations/${AUTOMATION_ID}`, "DELETE"), { params: Promise.resolve({ id: AUTOMATION_ID }) }),
    ]

    expect(responses.map((response) => response.status)).toEqual([201, 201, 201, 200, 200, 200, 201, 201, 201, 200, 200, 200])
    expect(state.auditCalls.map((call) => call.action)).toEqual([
      "posts.create",
      "posts.schedule",
      "posts.publish_now",
      "posts.drafts.update",
      "posts.drafts.delete",
      "brand_profile.write",
      "media.upload",
      "media.generate",
      "automations.create",
      "automations.update",
      "automations.toggle",
      "automations.delete",
    ])
    expect(state.auditCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "req_phase1_route_audit",
          context: expect.objectContaining({ workspaceId: WORKSPACE_ID }),
          action: "posts.publish_now",
          scopesRequired: ["posts:publish_now"],
          statusCode: 201,
        }),
        expect.objectContaining({
          action: "media.generate",
          scopesRequired: ["media:generate"],
          statusCode: 201,
        }),
        expect.objectContaining({
          action: "automations.toggle",
          scopesRequired: ["automations:toggle"],
          route: "/api/developer/v1/automations/:id/toggle",
          statusCode: 200,
        }),
      ]),
    )
  })
})
