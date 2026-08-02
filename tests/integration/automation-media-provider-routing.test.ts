import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const socialAccountId = "22222222-2222-4222-8222-222222222222"
const origin = "https://social.swiftdigital-s.com"

const state = vi.hoisted(() => ({
  account: null as Record<string, unknown> | null,
  fetchUrls: [] as string[],
}))

function createAccountQuery() {
  const filters: Record<string, unknown> = {}
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => {
      filters[key] = value
      return query
    }),
    in: vi.fn(() => query),
    single: vi.fn(async () => {
      const account = state.account
      const matches = account
        && Object.entries(filters).every(([key, value]) => account[key] === value)
      return matches
        ? { data: { ...account }, error: null }
        : { data: null, error: { message: "Account not found" } }
    }),
  }
  return query
}

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from: () => createAccountQuery(),
  }),
}))

vi.mock("@/lib/workspace-utils", () => ({
  getActiveWorkspace: async () => ({ id: workspaceId }),
}))

vi.mock("@/lib/meta-account", () => ({
  canReadConnectedMediaWithMetaAccount: () => true,
  decryptMetaAccountRow: (row: Record<string, unknown>) => row,
}))

vi.stubGlobal("fetch", async (url: string) => {
  state.fetchUrls.push(String(url))
  return new Response(JSON.stringify({
    data: [{
      id: "17895695668004550",
      media_type: "IMAGE",
      media_url: "https://cdn.example.test/ig.jpg",
      timestamp: "2026-07-30T18:00:00+0000",
    }],
  }), { status: 200 })
})

import * as automationMediaRoute from "@/app/api/automations/media/route"
import * as legacyInstagramMediaRoute from "@/app/api/automations/instagram-media/route"

describe("automation media provider routing", () => {
  beforeEach(() => {
    state.fetchUrls = []
    state.account = {
      id: socialAccountId,
      workspace_id: workspaceId,
      platform: "instagram",
      account_id: "ig-user-1",
      access_token: "ig-token",
      metadata: { connection_method: "instagram_login" },
    }
  })

  it("uses Instagram Graph for the canvas post selector", async () => {
    const response = await automationMediaRoute.GET(new NextRequest(
      `${origin}/api/automations/media?account_id=${socialAccountId}`,
    ))

    expect(response.status).toBe(200)
    expect(state.fetchUrls).toHaveLength(1)
    expect(state.fetchUrls[0]).toMatch(
      /^https:\/\/graph\.instagram\.com\/v25\.0\/ig-user-1\/media/,
    )
  })

  it("uses Instagram Graph for the legacy post selector", async () => {
    const response = await legacyInstagramMediaRoute.GET(new NextRequest(
      `${origin}/api/automations/instagram-media?account_id=${socialAccountId}`,
    ))

    expect(response.status).toBe(200)
    expect(state.fetchUrls).toHaveLength(1)
    expect(state.fetchUrls[0]).toMatch(
      /^https:\/\/graph\.instagram\.com\/v25\.0\/ig-user-1\/media/,
    )
  })
})
