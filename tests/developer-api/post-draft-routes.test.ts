import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  posts: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/developer-api/http", () => ({
  withDeveloperApiAuth: async (
    _request: Request,
    _config: unknown,
    handler: (context: { workspaceId: string }) => Promise<NextResponse>,
  ) => {
    try {
      return await handler({ workspaceId: "11111111-1111-4111-8111-111111111111" })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Developer API request failed" }, { status: 500 })
    }
  },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => createPostsQuery(),
  }),
}))

function createPostsQuery() {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, unknown[]> = {}
  let operation: "select" | "update" | "delete" = "select"
  let updatePayload: Record<string, unknown> = {}

  const findIndex = () => state.posts.findIndex((post) => {
    const matchesEq = Object.entries(filters).every(([key, value]) => post[key] === value)
    const matchesIn = Object.entries(inFilters).every(([key, values]) => values.includes(post[key]))
    return matchesEq && matchesIn
  })

  const query = {
    select: vi.fn(() => query),
    update: vi.fn((payload: Record<string, unknown>) => {
      operation = "update"
      updatePayload = payload
      return query
    }),
    delete: vi.fn(() => {
      operation = "delete"
      return query
    }),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    in: vi.fn((key: string, values: unknown[]) => {
      inFilters[key] = values
      return query
    }),
    maybeSingle: vi.fn(async () => {
      const index = findIndex()
      return { data: index >= 0 ? { ...state.posts[index] } : null, error: null }
    }),
    single: vi.fn(async () => {
      const index = findIndex()
      if (index < 0) return { data: null, error: { message: "Post not found" } }

      if (operation === "update") {
        state.posts[index] = { ...state.posts[index], ...updatePayload }
        return { data: { ...state.posts[index] }, error: null }
      }

      if (operation === "delete") {
        const [deleted] = state.posts.splice(index, 1)
        return { data: { ...deleted }, error: null }
      }

      return { data: { ...state.posts[index] }, error: null }
    }),
  }

  return query
}

import * as draftPostRoute from "@/app/api/developer/v1/posts/drafts/[id]/route"

const origin = "https://social.swiftdigital-s.com"
const workspaceId = "11111111-1111-4111-8111-111111111111"
const postId = "22222222-2222-4222-8222-222222222222"

function seedDraftPost(overrides: Record<string, unknown> = {}) {
  state.posts = [{
    id: postId,
    workspace_id: workspaceId,
    content: "Original caption",
    media_urls: ["https://example.com/image.png"],
    platforms: ["instagram", "facebook"],
    status: "draft",
    scheduled_for: null,
    published_at: null,
    created_at: "2026-05-14T00:00:00.000Z",
    updated_at: "2026-05-14T00:00:00.000Z",
    ...overrides,
  }]
}

describe("developer API draft post routes", () => {
  beforeEach(() => {
    seedDraftPost()
  })

  it("updates a draft post content field while preserving omitted platforms and media", async () => {
    const response = await draftPostRoute.PATCH(new NextRequest(`${origin}/api/developer/v1/posts/drafts/${postId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Updated from Claude" }),
    }), { params: Promise.resolve({ id: postId }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      post: {
        id: postId,
        content: "Updated from Claude",
        platforms: ["instagram", "facebook"],
        media_urls: ["https://example.com/image.png"],
        status: "draft",
      },
    })
  })

  it("deletes draft posts by id", async () => {
    expect(typeof (draftPostRoute as typeof draftPostRoute & { DELETE?: unknown }).DELETE).toBe("function")

    const response = await (draftPostRoute as typeof draftPostRoute & {
      DELETE: typeof draftPostRoute.PATCH
    }).DELETE(new NextRequest(`${origin}/api/developer/v1/posts/drafts/${postId}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: postId }) })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      deleted: true,
      post: {
        id: postId,
        status: "draft",
      },
    })
    expect(state.posts).toHaveLength(0)
  })

  it("updates and deletes scheduled posts through the same draft endpoint", async () => {
    seedDraftPost({ status: "scheduled", scheduled_for: "2026-05-15T08:00:00.000Z" })

    const updateResponse = await draftPostRoute.PATCH(new NextRequest(`${origin}/api/developer/v1/posts/drafts/${postId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "scheduled", scheduledAt: "2026-05-16T09:00:00.000Z" }),
    }), { params: Promise.resolve({ id: postId }) })

    expect(updateResponse.status).toBe(200)
    await expect(updateResponse.json()).resolves.toMatchObject({
      post: {
        id: postId,
        status: "scheduled",
        scheduled_for: "2026-05-16T09:00:00.000Z",
      },
    })

    const deleteResponse = await (draftPostRoute as typeof draftPostRoute & {
      DELETE: typeof draftPostRoute.PATCH
    }).DELETE(new NextRequest(`${origin}/api/developer/v1/posts/drafts/${postId}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: postId }) })

    expect(deleteResponse.status).toBe(200)
    expect(state.posts).toHaveLength(0)
  })

  it("does not delete published posts through draft/scheduled endpoints", async () => {
    seedDraftPost({ status: "published", published_at: "2026-05-14T01:00:00.000Z" })

    const response = await (draftPostRoute as typeof draftPostRoute & {
      DELETE: typeof draftPostRoute.PATCH
    }).DELETE(new NextRequest(`${origin}/api/developer/v1/posts/drafts/${postId}`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: postId }) })

    expect(response.status).toBe(404)
    expect(state.posts).toHaveLength(1)
  })

  it("returns 400 for invalid post ids instead of a generic server error", async () => {
    const updateResponse = await draftPostRoute.PATCH(new NextRequest(`${origin}/api/developer/v1/posts/drafts/not-a-uuid`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Updated" }),
    }), { params: Promise.resolve({ id: "not-a-uuid" }) })

    expect(updateResponse.status).toBe(400)
    await expect(updateResponse.json()).resolves.toMatchObject({
      error: "Invalid post id",
    })

    const deleteResponse = await (draftPostRoute as typeof draftPostRoute & {
      DELETE: typeof draftPostRoute.PATCH
    }).DELETE(new NextRequest(`${origin}/api/developer/v1/posts/drafts/not-a-uuid`, {
      method: "DELETE",
    }), { params: Promise.resolve({ id: "not-a-uuid" }) })

    expect(deleteResponse.status).toBe(400)
    await expect(deleteResponse.json()).resolves.toMatchObject({
      error: "Invalid post id",
    })
  })
})
