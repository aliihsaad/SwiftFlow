import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const uploadState = vi.hoisted(() => ({
  uploads: [] as Array<{
    bucket: string
    path: string
    bytes: number
    contentType?: string
    upsert?: boolean
  }>,
  requiredScopes: [] as string[],
}))

vi.mock("@/lib/developer-api/http", () => ({
  withDeveloperApiAuth: async (
    _request: Request,
    config: { requiredScopes: string[] },
    handler: (context: { workspaceId: string }) => Promise<NextResponse>,
  ) => {
    uploadState.requiredScopes = [...config.requiredScopes]
    return handler({ workspaceId: "11111111-1111-4111-8111-111111111111" })
  },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, options: { contentType?: string; upsert?: boolean }) => {
          uploadState.uploads.push({
            bucket,
            path,
            bytes: body.byteLength,
            contentType: options.contentType,
            upsert: options.upsert,
          })
          return { data: { path }, error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.example.test/storage/v1/object/public/${bucket}/${path}` },
        }),
      }),
    },
  }),
}))

import * as mediaRoute from "@/app/api/developer/v1/media/route"

const origin = "https://social.swiftdigital-s.com"

describe("developer API media upload route", () => {
  beforeEach(() => {
    uploadState.uploads = []
    uploadState.requiredScopes = []
  })

  it("uploads base64 media into post_media and returns a public URL", async () => {
    const response = await mediaRoute.POST(new NextRequest(`${origin}/api/developer/v1/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        base64: Buffer.from("hello image").toString("base64"),
        mimeType: "image/png",
        fileName: "Launch card.png",
      }),
    }))

    expect(response.status).toBe(201)
    expect(uploadState.requiredScopes).toEqual(["media:upload"])
    expect(uploadState.uploads).toHaveLength(1)
    expect(uploadState.uploads[0]).toMatchObject({
      bucket: "post_media",
      bytes: 11,
      contentType: "image/png",
      upsert: false,
    })
    expect(uploadState.uploads[0].path).toMatch(/^11111111-1111-4111-8111-111111111111\/developer-api\/\d+-[0-9a-f-]+\.png$/)
    await expect(response.json()).resolves.toMatchObject({
      bucket: "post_media",
      contentType: "image/png",
      size: 11,
      publicUrl: expect.stringContaining("/post_media/11111111-1111-4111-8111-111111111111/developer-api/"),
    })
  })

  it("accepts data URLs and rejects unsupported media types", async () => {
    const validResponse = await mediaRoute.POST(new NextRequest(`${origin}/api/developer/v1/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        base64: `data:image/jpeg;base64,${Buffer.from("jpeg").toString("base64")}`,
        fileName: "photo.jpg",
      }),
    }))

    expect(validResponse.status).toBe(201)

    const invalidResponse = await mediaRoute.POST(new NextRequest(`${origin}/api/developer/v1/media`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        base64: Buffer.from("<svg></svg>").toString("base64"),
        mimeType: "image/svg+xml",
      }),
    }))

    expect(invalidResponse.status).toBe(400)
    await expect(invalidResponse.json()).resolves.toMatchObject({
      error: "Unsupported media type",
    })
  })
})
