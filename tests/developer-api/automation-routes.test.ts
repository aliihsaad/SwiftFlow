import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const accountId = "22222222-2222-4222-8222-222222222222"
const postId = "17895695668004550"
const origin = "https://social.swiftdigital-s.com"

const state = vi.hoisted(() => ({
  socialAccounts: [] as Array<Record<string, unknown>>,
  automations: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/developer-api/http", () => ({
  withDeveloperApiAuth: async (
    _request: Request,
    _config: unknown,
    handler: (context: { workspaceId: string }) => Promise<NextResponse>,
  ) => handler({ workspaceId: "11111111-1111-4111-8111-111111111111" }),
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => createQuery(table),
  }),
}))

function tableRows(table: string) {
  if (table === "social_accounts") return state.socialAccounts
  if (table === "automations") return state.automations
  return []
}

function createQuery(table: string) {
  const filters: Record<string, unknown> = {}
  let insertPayload: Record<string, unknown> | null = null
  let updatePayload: Record<string, unknown> | null = null
  let operation: "select" | "insert" | "update" | "delete" = "select"

  const findIndex = () => tableRows(table).findIndex((candidate) => (
    Object.entries(filters).every(([key, value]) => candidate[key] === value)
  ))

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    maybeSingle: vi.fn(async () => {
      const index = findIndex()
      const row = index >= 0 ? tableRows(table)[index] : null
      return { data: row ? { ...row } : null, error: null }
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
    single: vi.fn(async () => {
      if (operation === "insert" && insertPayload) {
        const row = {
          id: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-05-14T00:00:00.000Z",
          updated_at: "2026-05-14T00:00:00.000Z",
          ...insertPayload,
        }
        state.automations.unshift(row)
        return { data: row, error: null }
      }
      const index = findIndex()
      if (index < 0) return { data: null, error: { message: "No rows found" } }
      if (operation === "update" && updatePayload) {
        state.automations[index] = { ...state.automations[index], ...updatePayload }
        return { data: { ...state.automations[index] }, error: null }
      }
      if (operation === "delete") {
        const [deleted] = state.automations.splice(index, 1)
        return { data: { ...deleted }, error: null }
      }
      return { data: null, error: { message: "Unsupported query" } }
    }),
  }

  return query
}

function validCommentAiGraph(overrides: Record<string, unknown> = {}) {
  return {
    nodes: [
      {
        id: "trigger-comment",
        type: "trigger",
        position: { x: 100, y: 100 },
        data: {
          type: "trigger_new_comment",
          label: "New Comment",
          config: {
            platform: "instagram",
            trigger_type: "any",
            keywords: [],
            social_account_id: accountId,
            post_id: postId,
            post_thumbnail_url: "https://example.com/thumb.jpg",
            post_caption: "Latest post",
          },
        },
      },
      {
        id: "ai-response",
        type: "action",
        position: { x: 380, y: 100 },
        data: {
          type: "action_ai_response",
          label: "AI Response",
          config: {
            use_global_settings: true,
            max_tokens: 500,
            preset_goal: "reply_comment",
            tone: "friendly",
            length: "short",
          },
        },
      },
      {
        id: "reply-comment",
        type: "action",
        position: { x: 660, y: 100 },
        data: {
          type: "action_reply_comment",
          label: "Reply to Comment",
          config: {
            use_ai_response: true,
            messages: ["Thanks for your comment!"],
            ...(overrides.replyConfig as Record<string, unknown> | undefined),
          },
        },
      },
    ],
    edges: [
      { id: "edge-1", source: "trigger-comment", target: "ai-response" },
      { id: "edge-2", source: "ai-response", target: "reply-comment" },
    ],
  }
}

async function createAutomation(body: Record<string, unknown>) {
  return automationRoutes.POST(new NextRequest(`${origin}/api/developer/v1/automations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }))
}

import * as automationRoutes from "@/app/api/developer/v1/automations/route"
import * as automationDetailRoutes from "@/app/api/developer/v1/automations/[id]/route"
import * as automationToggleRoutes from "@/app/api/developer/v1/automations/[id]/toggle/route"

describe("developer API automation routes", () => {
  beforeEach(() => {
    state.socialAccounts = [{ id: accountId, workspace_id: workspaceId, platform: "instagram" }]
    state.automations = []
  })

  it("rejects connector-created automations without a workflow graph", async () => {
    const response = await createAutomation({
      social_account_id: accountId,
      name: "Bad wizard automation",
      editor_version: "wizard",
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("workflow_graph"),
    })
    expect(state.automations).toHaveLength(0)
  })

  it("rejects connector-created automations that request wizard editor mode", async () => {
    const response = await createAutomation({
      social_account_id: accountId,
      name: "Bad wizard automation",
      editor_version: "wizard",
      workflow_graph: validCommentAiGraph(),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("canvas"),
    })
    expect(state.automations).toHaveLength(0)
  })

  it("rejects active graph automations with unconfigured reply nodes", async () => {
    const response = await createAutomation({
      social_account_id: accountId,
      name: "Empty comment reply",
      is_active: true,
      workflow_graph: validCommentAiGraph({
        replyConfig: { use_ai_response: false, messages: [""] },
      }),
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid workflow_graph",
      validationErrors: expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_FIELD",
          nodeId: "reply-comment",
        }),
      ]),
    })
    expect(state.automations).toHaveLength(0)
  })

  it("stores valid connector-created automations as canvas graph-backed records", async () => {
    const response = await createAutomation({
      social_account_id: accountId,
      name: "Comment AI reply",
      workflow_graph: validCommentAiGraph(),
    })

    expect(response.status).toBe(201)
    expect(state.automations).toHaveLength(1)
    expect(state.automations[0]).toMatchObject({
      workspace_id: workspaceId,
      social_account_id: accountId,
      name: "Comment AI reply",
      editor_version: "canvas",
      platform_post_id: postId,
      post_thumbnail_url: "https://example.com/thumb.jpg",
      post_caption: "Latest post",
      trigger_config: { trigger_type: "any_comment", keywords: [] },
      workflow_graph: validCommentAiGraph(),
    })
    await expect(response.json()).resolves.toMatchObject({
      automation: {
        editor_version: "canvas",
        platform_post_id: postId,
      },
    })
  })

  it("accepts connector-friendly delay and AI config aliases in workflow graphs", async () => {
    const graph = validCommentAiGraph()
    graph.nodes.splice(1, 0, {
      id: "delay",
      type: "action",
      position: { x: 240, y: 100 },
      data: {
        type: "action_delay",
        label: "Delay",
        config: {
          duration: "30",
          unit: "seconds",
        },
      },
    })
    graph.edges = [
      { id: "edge-1", source: "trigger-comment", target: "delay" },
      { id: "edge-2", source: "delay", target: "ai-response" },
      { id: "edge-3", source: "ai-response", target: "reply-comment" },
    ]
    graph.nodes[2].data.config = {
      ...graph.nodes[2].data.config,
      max_tokens: "500",
    }

    const response = await createAutomation({
      social_account_id: accountId,
      name: "Comment AI reply with delay",
      workflow_graph: graph,
    })

    expect(response.status).toBe(201)
    expect(state.automations[0].workflow_graph).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "delay",
          data: expect.objectContaining({
            config: expect.objectContaining({
              duration_value: 30,
              duration_unit: "seconds",
            }),
          }),
        }),
        expect.objectContaining({
          id: "ai-response",
          data: expect.objectContaining({
            config: expect.objectContaining({
              max_tokens: 500,
            }),
          }),
        }),
      ]),
    })
  })

  it("creates configured canvas automations from stable templates", async () => {
    const response = await createAutomation({
      template_id: "tpl-reply-comments-ai",
      social_account_id: accountId,
      name: "Template AI reply",
      post_id: postId,
      post_thumbnail_url: "https://example.com/template-thumb.jpg",
      post_caption: "Template post",
      delay_seconds: 30,
      ai_tone: "professional",
      ai_length: "short",
      is_active: true,
    })

    expect(response.status).toBe(201)
    expect(state.automations[0]).toMatchObject({
      name: "Template AI reply",
      is_active: true,
      editor_version: "canvas",
      platform_post_id: postId,
      post_thumbnail_url: "https://example.com/template-thumb.jpg",
      post_caption: "Template post",
      trigger_config: { trigger_type: "any_comment", keywords: [] },
    })
    expect(state.automations[0].workflow_graph).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            type: "trigger_new_comment",
            config: expect.objectContaining({
              social_account_id: accountId,
              post_id: postId,
              post_thumbnail_url: "https://example.com/template-thumb.jpg",
              post_caption: "Template post",
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            type: "action_delay",
            config: expect.objectContaining({
              duration_value: 30,
              duration_unit: "seconds",
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            type: "action_ai_response",
            config: expect.objectContaining({
              tone: "professional",
              length: "short",
            }),
          }),
        }),
      ]),
    })
  })

  it("updates existing automations by recompiling stable templates", async () => {
    const createResponse = await createAutomation({
      template_id: "tpl-reply-comments-ai",
      social_account_id: accountId,
      name: "Template AI reply",
      post_id: postId,
      delay_seconds: 30,
    })
    expect(createResponse.status).toBe(201)
    const automationId = String(state.automations[0].id)

    const response = await automationDetailRoutes.PATCH(new NextRequest(`${origin}/api/developer/v1/automations/${automationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        template_id: "tpl-reply-comments-ai",
        name: "Updated template automation",
        post_id: "17895695668004551",
        delay_seconds: 45,
        ai_tone: "playful",
      }),
    }), { params: Promise.resolve({ id: automationId }) })

    expect(response.status).toBe(200)
    expect(state.automations[0]).toMatchObject({
      id: automationId,
      name: "Updated template automation",
      platform_post_id: "17895695668004551",
      editor_version: "canvas",
    })
    expect(state.automations[0].workflow_graph).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            type: "action_delay",
            config: expect.objectContaining({
              duration_value: 45,
              duration_unit: "seconds",
            }),
          }),
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            type: "action_ai_response",
            config: expect.objectContaining({ tone: "playful" }),
          }),
        }),
      ]),
    })
  })

  it("returns 404 when updating, toggling, or deleting missing automations", async () => {
    const missingId = "44444444-4444-4444-8444-444444444444"

    const updateResponse = await automationDetailRoutes.PATCH(new NextRequest(`${origin}/api/developer/v1/automations/${missingId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Missing" }),
    }), { params: Promise.resolve({ id: missingId }) })
    expect(updateResponse.status).toBe(404)

    const toggleResponse = await automationToggleRoutes.POST(new NextRequest(`${origin}/api/developer/v1/automations/${missingId}/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    }), { params: Promise.resolve({ id: missingId }) })
    expect(toggleResponse.status).toBe(404)

    const deleteResponse = await automationDetailRoutes.DELETE(new NextRequest(`${origin}/api/developer/v1/automations/${missingId}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: missingId }) })
    expect(deleteResponse.status).toBe(404)
  })

  it("toggles and deletes existing automations with confirmation-friendly responses", async () => {
    const createResponse = await createAutomation({
      social_account_id: accountId,
      name: "Comment AI reply",
      workflow_graph: validCommentAiGraph(),
    })
    expect(createResponse.status).toBe(201)
    const automationId = String(state.automations[0].id)

    const toggleResponse = await automationToggleRoutes.POST(new NextRequest(`${origin}/api/developer/v1/automations/${automationId}/toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: false }),
    }), { params: Promise.resolve({ id: automationId }) })

    expect(toggleResponse.status).toBe(200)
    await expect(toggleResponse.json()).resolves.toMatchObject({
      automation: {
        id: automationId,
        is_active: false,
      },
    })

    const deleteResponse = await automationDetailRoutes.DELETE(new NextRequest(`${origin}/api/developer/v1/automations/${automationId}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: automationId }) })

    expect(deleteResponse.status).toBe(200)
    await expect(deleteResponse.json()).resolves.toMatchObject({
      deleted: true,
      automation: {
        id: automationId,
      },
    })
    expect(state.automations).toHaveLength(0)
  })
})
