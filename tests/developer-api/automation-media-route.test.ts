import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const instagramAccountId = "22222222-2222-4222-8222-222222222222"
const facebookAccountId = "33333333-3333-4333-8333-333333333333"
const origin = "https://social.swiftdigital-s.com"

const state = vi.hoisted(() => ({
  accounts: [] as Array<Record<string, unknown>>,
  requiredScopes: [] as string[],
  fetchUrls: [] as string[],
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
    from: () => createAccountsQuery(),
  }),
}))

vi.mock("@/lib/meta-account", () => ({
  canReadConnectedMediaWithMetaAccount: () => true,
  decryptMetaAccountRow: (row: Record<string, unknown>) => row,
}))

function createAccountsQuery() {
  const filters: Record<string, unknown> = {}
  const inFilters: Record<string, unknown[]> = {}
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    in: vi.fn((key: string, value: unknown[]) => {
      inFilters[key] = value
      return query
    }),
    single: vi.fn(async () => {
      const account = state.accounts.find((candidate) => {
        const matchesEq = Object.entries(filters).every(([key, value]) => candidate[key] === value)
        const matchesIn = Object.entries(inFilters).every(([key, values]) => values.includes(candidate[key]))
        return matchesEq && matchesIn
      })
      return account
        ? { data: { ...account }, error: null }
        : { data: null, error: { message: "Account not found" } }
    }),
  }
  return query
}

vi.stubGlobal("fetch", async (url: string) => {
  state.fetchUrls.push(String(url))
  if (String(url).includes("/ig-user-1/media")) {
    return new Response(JSON.stringify({
      data: [{
        id: "17895695668004550",
        media_type: "IMAGE",
        media_url: "https://cdn.example.test/ig.jpg",
        caption: "Latest Instagram post",
        timestamp: "2026-05-14T09:00:00+0000",
        permalink: "https://instagram.com/p/test",
      }],
    }), { status: 200 })
  }

  return new Response(JSON.stringify({
    data: [{
      id: "987654321_123456789",
      message: "Latest Facebook post",
      full_picture: "https://cdn.example.test/fb.jpg",
      created_time: "2026-05-14T09:05:00+0000",
      permalink_url: "https://facebook.com/post/test",
    }],
  }), { status: 200 })
})

import * as automationMediaRoute from "@/app/api/developer/v1/automation-media/route"

describe("developer API automation media route", () => {
  beforeEach(() => {
    state.requiredScopes = []
    state.fetchUrls = []
    state.accounts = [
      {
        id: instagramAccountId,
        workspace_id: workspaceId,
        platform: "instagram",
        account_id: "ig-user-1",
        access_token: "ig-token",
        metadata: {},
      },
      {
        id: facebookAccountId,
        workspace_id: workspaceId,
        platform: "facebook",
        account_id: "fb-page-1",
        access_token: "fb-token",
        metadata: {},
      },
    ]
  })

  it("lists selectable Instagram media for automation trigger post IDs", async () => {
    const response = await automationMediaRoute.GET(new NextRequest(`${origin}/api/developer/v1/automation-media?account_id=${instagramAccountId}&limit=3`))

    expect(response.status).toBe(200)
    expect(state.requiredScopes).toEqual(["automations:read"])
    expect(state.fetchUrls[0]).toContain("/ig-user-1/media")
    expect(state.fetchUrls[0]).toContain("limit=3")
    await expect(response.json()).resolves.toMatchObject({
      platform: "instagram",
      account_id: instagramAccountId,
      media: [{
        id: "17895695668004550",
        media_type: "IMAGE",
        thumbnail_url: "https://cdn.example.test/ig.jpg",
        caption: "Latest Instagram post",
      }],
    })
  })

  it("lists selectable Facebook page posts in the same normalized media shape", async () => {
    const response = await automationMediaRoute.GET(new NextRequest(`${origin}/api/developer/v1/automation-media?account_id=${facebookAccountId}`))

    expect(response.status).toBe(200)
    expect(state.fetchUrls[0]).toContain("/fb-page-1/posts")
    await expect(response.json()).resolves.toMatchObject({
      platform: "facebook",
      account_id: facebookAccountId,
      media: [{
        id: "987654321_123456789",
        media_type: "IMAGE",
        media_url: "https://cdn.example.test/fb.jpg",
        thumbnail_url: "https://cdn.example.test/fb.jpg",
        caption: "Latest Facebook post",
      }],
    })
  })

  it("rejects missing account ids before calling Meta", async () => {
    const response = await automationMediaRoute.GET(new NextRequest(`${origin}/api/developer/v1/automation-media`))

    expect(response.status).toBe(400)
    expect(state.fetchUrls).toHaveLength(0)
    await expect(response.json()).resolves.toMatchObject({
      error: "account_id is required",
    })
  })
})
