import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const OWNED_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_WORKSPACE_ID = "22222222-2222-4222-8222-222222222222"
const USER_ID = "33333333-3333-4333-8333-333333333333"
const POST_ID = "44444444-4444-4444-8444-444444444444"
const SESSION_ID = "55555555-5555-4555-8555-555555555555"
const ORIGIN = "https://social.swiftdigital-s.com"

const state = vi.hoisted(() => ({
  activeWorkspaceId: "11111111-1111-4111-8111-111111111111",
  allowedWorkspaceIds: ["11111111-1111-4111-8111-111111111111"] as string[],
  posts: [] as Array<Record<string, unknown>>,
  brandProfiles: [] as Array<Record<string, unknown>>,
  chatSessions: [] as Array<Record<string, unknown>>,
  workspaceSettings: [] as Array<Record<string, unknown>>,
  workspaceMembers: [] as Array<Record<string, unknown>>,
  functionInvocations: [] as string[],
}))

vi.mock("@/lib/workspace-utils", () => ({
  getActiveWorkspace: async () => ({ id: state.activeWorkspaceId, name: "Owned workspace" }),
}))

vi.mock("@/lib/workspace-permissions", () => {
  class WorkspacePermissionError extends Error {
    constructor(message: string, public status = 403) {
      super(message)
      this.name = "WorkspacePermissionError"
    }
  }

  return {
    WorkspacePermissionError,
    requireWorkspacePermission: async (_supabase: unknown, _userId: string, workspaceId: string) => {
      if (!state.allowedWorkspaceIds.includes(workspaceId)) {
        throw new WorkspacePermissionError("No access to the selected workspace", 403)
      }
      return "owner"
    },
    getWorkspacePermissionErrorStatus: (error: unknown) => error instanceof WorkspacePermissionError ? error.status : null,
  }
})

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => createSupabaseClient(),
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    ...createSupabaseClient(),
    functions: {
      invoke: async (name: string) => {
        state.functionInvocations.push(name)
        return { data: { ok: true }, error: null }
      },
    },
  }),
}))

vi.mock("@/lib/secret-crypto", () => ({
  encryptSecretIfNeeded: (value: unknown) => typeof value === "string" ? `enc:${value}` : value,
  isEncryptedSecret: (value: unknown) => typeof value === "string" && value.startsWith("enc:"),
  normalizeOptionalSecretInput: (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null,
}))

vi.mock("@/lib/ai-models", () => ({
  getDefaultModelForProvider: () => "openrouter/test-model",
}))

function rowsForTable(table: string) {
  if (table === "posts") return state.posts
  if (table === "workspace_brand_profiles") return state.brandProfiles
  if (table === "chat_sessions") return state.chatSessions
  if (table === "workspace_settings") return state.workspaceSettings
  if (table === "workspace_members") return state.workspaceMembers
  return []
}

function createSupabaseClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: (table: string) => createQuery(table),
  }
}

function createQuery(table: string) {
  const filters: Record<string, unknown> = {}
  let operation: "select" | "insert" | "update" | "delete" = "select"
  let insertPayload: Record<string, unknown> | null = null
  let updatePayload: Record<string, unknown> | null = null

  const findRows = () => rowsForTable(table).filter((row) => (
    Object.entries(filters).every(([key, value]) => row[key] === value)
  ))
  const findIndex = () => rowsForTable(table).findIndex((row) => (
    Object.entries(filters).every(([key, value]) => row[key] === value)
  ))
  const selected = async () => ({ data: findRows().map((row) => ({ ...row })), error: null })

  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
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
    maybeSingle: vi.fn(async () => ({ data: findRows()[0] ? { ...findRows()[0] } : null, error: null })),
    single: vi.fn(async () => {
      const rows = rowsForTable(table)
      if (operation === "insert" && insertPayload) {
        const row = {
          id: `${table}-created`,
          created_at: "2026-05-18T00:00:00.000Z",
          updated_at: "2026-05-18T00:00:00.000Z",
          ...insertPayload,
        }
        rows.push(row)
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
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => selected().then(resolve, reject),
  }

  return query
}

function jsonRequest(url: string, method: string, body: Record<string, unknown>) {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

import * as postsRoute from "@/app/api/posts/route"
import * as brandProfileRoute from "@/app/api/brand-profile/route"
import * as chatSessionsRoute from "@/app/api/chat/sessions/route"
import * as chatSessionByIdRoute from "@/app/api/chat/sessions/[id]/route"
import * as workspaceSettingsRoute from "@/app/api/workspace/settings/route"
import { resolveAssistantWorkspace } from "@/lib/assistant/auth"

describe("cross-workspace route mutations", () => {
  beforeEach(() => {
    state.activeWorkspaceId = OWNED_WORKSPACE_ID
    state.allowedWorkspaceIds = [OWNED_WORKSPACE_ID]
    state.functionInvocations = []
    state.posts = [
      {
        id: POST_ID,
        workspace_id: OTHER_WORKSPACE_ID,
        content: "Other workspace post",
        media_urls: ["https://cdn.example.com/other.png"],
        platforms: ["instagram"],
        status: "draft",
        scheduled_for: null,
      },
    ]
    state.brandProfiles = [
      { id: "owned-brand", workspace_id: OWNED_WORKSPACE_ID, business_name: "Owned", brand_colors: { primary: "#000000" } },
      { id: "other-brand", workspace_id: OTHER_WORKSPACE_ID, business_name: "Other", brand_colors: { primary: "#FFFFFF" } },
    ]
    state.chatSessions = [
      { id: SESSION_ID, workspace_id: OTHER_WORKSPACE_ID, user_id: "other-user", title: "Other session", messages: [] },
    ]
    state.workspaceSettings = [
      { id: "owned-settings", workspace_id: OWNED_WORKSPACE_ID, ai_provider: "openrouter", ai_model_name: "owned-model" },
      { id: "other-settings", workspace_id: OTHER_WORKSPACE_ID, ai_provider: "gemini", ai_model_name: "other-model" },
    ]
    state.workspaceMembers = [
      { workspace_id: OWNED_WORKSPACE_ID, user_id: USER_ID, role: "owner", created_at: "2026-05-01T00:00:00.000Z" },
    ]
  })

  it("does not update another workspace post through app post PUT or PATCH", async () => {
    const put = await postsRoute.PUT(jsonRequest(`${ORIGIN}/api/posts`, "PUT", {
      id: POST_ID,
      workspace_id: OTHER_WORKSPACE_ID,
      platforms: ["instagram"],
      captionByPlatform: { instagram: "Hijacked" },
      mediaUrls: ["https://cdn.example.com/new.png"],
      status: "draft",
    }))

    expect(put.status).toBe(500)
    expect(state.posts[0]).toMatchObject({
      workspace_id: OTHER_WORKSPACE_ID,
      content: "Other workspace post",
    })

    const patch = await postsRoute.PATCH(jsonRequest(`${ORIGIN}/api/posts`, "PATCH", {
      id: POST_ID,
      scheduledAt: "2026-06-01T12:00:00.000Z",
    }))

    expect(patch.status).toBe(500)
    expect(state.posts[0].scheduled_for).toBeNull()
  })

  it("ignores body workspace_id when updating the active workspace brand profile", async () => {
    const response = await brandProfileRoute.PUT(jsonRequest(`${ORIGIN}/api/brand-profile`, "PUT", {
      workspace_id: OTHER_WORKSPACE_ID,
      business_name: "Updated owned brand",
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
      brand_colors: { primary: "#050505", secondary: "#A1A1AA", accent: "#00E5FF", enabled: true },
      reference_image_urls: [],
      instagram_handle: "",
      facebook_page: "",
      content_themes: [],
    }))

    expect(response.status).toBe(200)
    expect(state.brandProfiles.find((row) => row.workspace_id === OWNED_WORKSPACE_ID)).toMatchObject({
      business_name: "Updated owned brand",
      workspace_id: OWNED_WORKSPACE_ID,
    })
    expect(state.brandProfiles.find((row) => row.workspace_id === OTHER_WORKSPACE_ID)).toMatchObject({
      business_name: "Other",
      workspace_id: OTHER_WORKSPACE_ID,
    })
  })

  it("does not update or delete another workspace chat session", async () => {
    const params = { params: Promise.resolve({ id: SESSION_ID }) }
    const patch = await chatSessionByIdRoute.PATCH(jsonRequest(`${ORIGIN}/api/chat/sessions/${SESSION_ID}`, "PATCH", {
      title: "Hijacked session",
      workspace_id: OTHER_WORKSPACE_ID,
    }), params)

    expect(patch.status).toBe(500)
    expect(state.chatSessions[0]).toMatchObject({
      title: "Other session",
      workspace_id: OTHER_WORKSPACE_ID,
    })

    const del = await chatSessionByIdRoute.DELETE(new NextRequest(`${ORIGIN}/api/chat/sessions/${SESSION_ID}`, {
      method: "DELETE",
    }), params)

    expect(del.status).toBe(200)
    expect(state.chatSessions).toHaveLength(1)
  })

  it("creates chat sessions only in the active workspace", async () => {
    const response = await chatSessionsRoute.POST(jsonRequest(`${ORIGIN}/api/chat/sessions`, "POST", {
      workspace_id: OTHER_WORKSPACE_ID,
      user_id: "attacker-user",
      title: "Owned session",
      messages: [{ role: "user", content: "Plan content" }],
    }))

    expect(response.status).toBe(200)
    expect(state.chatSessions.at(-1)).toMatchObject({
      workspace_id: OWNED_WORKSPACE_ID,
      user_id: USER_ID,
      title: "Owned session",
    })
  })

  it("rejects workspace settings writes for unowned workspace ids", async () => {
    const response = await workspaceSettingsRoute.PUT(jsonRequest(`${ORIGIN}/api/workspace/settings`, "PUT", {
      workspaceId: OTHER_WORKSPACE_ID,
      ai_provider: "openai",
      ai_model_name: "attacker-model",
    }))

    expect(response.status).toBe(403)
    expect(state.workspaceSettings.find((row) => row.workspace_id === OTHER_WORKSPACE_ID)).toMatchObject({
      ai_provider: "gemini",
      ai_model_name: "other-model",
    })
  })

  it("assistant workspace resolution ignores unauthorized body and cookie workspace ids", async () => {
    const request = new NextRequest(`${ORIGIN}/api/assistant/command`, {
      method: "POST",
      headers: {
        cookie: `active_workspace_id=${OTHER_WORKSPACE_ID}`,
      },
      body: JSON.stringify({ workspaceId: OTHER_WORKSPACE_ID }),
    })

    await expect(resolveAssistantWorkspace(request, OTHER_WORKSPACE_ID)).resolves.toEqual({
      userId: USER_ID,
      workspaceId: OWNED_WORKSPACE_ID,
    })
  })
})
