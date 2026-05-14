import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  requiredScopes: [] as string[],
  functionInvocations: [] as Array<{ name: string; body: Record<string, unknown> }>,
  uploads: [] as Array<{
    bucket: string
    path: string
    bytes: number
    contentType?: string
    upsert?: boolean
  }>,
  posts: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/lib/developer-api/http", () => ({
  withDeveloperApiAuth: async (
    _request: Request,
    config: { requiredScopes: string[] },
    handler: (context: { workspaceId: string }) => Promise<NextResponse>,
  ) => {
    state.requiredScopes = [...config.requiredScopes]
    return handler({ workspaceId: "11111111-1111-4111-8111-111111111111" })
  },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    functions: {
      invoke: async (name: string, options: { body?: Record<string, unknown> }) => {
        state.functionInvocations.push({ name, body: options.body || {} })
        return {
          data: {
            result: {
              imageUrl: "https://assets.example.com/generated.png",
              model: "test-image-model",
            },
          },
          error: null,
        }
      },
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, options: { contentType?: string; upsert?: boolean }) => {
          state.uploads.push({
            bucket,
            path,
            bytes: body.byteLength,
            contentType: options.contentType,
            upsert: options.upsert,
          })
          return { data: { path }, error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example.com/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
    from: () => createPostsQuery(),
  }),
}))

function createPostsQuery() {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, unknown[]> = {}
  let operation: "select" | "update" = "select"
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
      }
      return { data: { ...state.posts[index] }, error: null }
    }),
  }

  return query
}

import * as mediaGenerateRoute from "@/app/api/developer/v1/media/generate/route"

const origin = "https://social.swiftdigital-s.com"
const workspaceId = "11111111-1111-4111-8111-111111111111"
const postId = "22222222-2222-4222-8222-222222222222"

describe("developer API media generation route", () => {
  beforeEach(() => {
    state.requiredScopes = []
    state.functionInvocations = []
    state.uploads = []
    state.posts = [{
      id: postId,
      workspace_id: workspaceId,
      content: "Original post caption",
      media_urls: ["https://cdn.example.com/old.png"],
      platforms: ["instagram"],
      status: "draft",
      scheduled_for: null,
      created_at: "2026-05-14T00:00:00.000Z",
      updated_at: "2026-05-14T00:00:00.000Z",
    }]
    vi.stubGlobal("fetch", vi.fn(async () => new Response(Buffer.from("generated image bytes"), {
      status: 200,
      headers: { "content-type": "image/png" },
    })))
  })

  it("generates an image through SwiftFlow and stores it in post_media", async () => {
    const response = await mediaGenerateRoute.POST(new NextRequest(`${origin}/api/developer/v1/media/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Create an AI-first social media poster",
        style: "branded product poster",
      }),
    }))

    expect(response.status).toBe(201)
    expect(state.requiredScopes).toEqual(["media:generate"])
    expect(state.functionInvocations).toEqual([{
      name: "generate-image",
      body: expect.objectContaining({
        workspaceId,
        prompt: "Create an AI-first social media poster",
        style: "branded product poster",
        messages: [{
          role: "user",
          content: "Create an AI-first social media poster",
        }],
      }),
    }])
    expect(state.uploads).toHaveLength(1)
    expect(state.uploads[0]).toMatchObject({
      bucket: "post_media",
      bytes: 21,
      contentType: "image/png",
      upsert: false,
    })
    expect(state.uploads[0].path).toMatch(/^11111111-1111-4111-8111-111111111111\/developer-api\/generated\/\d+-[0-9a-f-]+\.png$/)
    await expect(response.json()).resolves.toMatchObject({
      attached: false,
      media: {
        bucket: "post_media",
        publicUrl: expect.stringContaining("/post_media/11111111-1111-4111-8111-111111111111/developer-api/generated/"),
        contentType: "image/png",
        size: 21,
        model: "test-image-model",
      },
    })
  })

  it("can attach generated media to a draft or scheduled post", async () => {
    const response = await mediaGenerateRoute.POST(new NextRequest(`${origin}/api/developer/v1/media/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: "Create an image for the existing draft",
        postId,
        attachMode: "append",
      }),
    }))

    expect(response.status).toBe(201)
    expect(state.requiredScopes).toEqual(["media:generate", "posts:update"])
    const generatedUrl = `https://cdn.example.com/storage/v1/object/public/post_media/${state.uploads[0].path}`
    await expect(response.json()).resolves.toMatchObject({
      attached: true,
      attachMode: "append",
      post: {
        id: postId,
        media_urls: ["https://cdn.example.com/old.png", generatedUrl],
      },
    })
    expect(state.posts[0].media_urls).toEqual(["https://cdn.example.com/old.png", generatedUrl])
  })
})
