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

  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    maybeSingle: vi.fn(async () => {
      const row = tableRows(table).find((candidate) => (
        Object.entries(filters).every(([key, value]) => candidate[key] === value)
      ))
      return { data: row ? { ...row } : null, error: null }
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      insertPayload = payload
      return query
    }),
    single: vi.fn(async () => {
      if (insertPayload) {
        const row = {
          id: "33333333-3333-4333-8333-333333333333",
          created_at: "2026-05-14T00:00:00.000Z",
          updated_at: "2026-05-14T00:00:00.000Z",
          ...insertPayload,
        }
        state.automations.unshift(row)
        return { data: row, error: null }
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
})
