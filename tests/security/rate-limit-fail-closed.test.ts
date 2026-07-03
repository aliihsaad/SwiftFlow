import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  rpcResult: { data: null as unknown, error: null as unknown },
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async () => state.rpcResult,
  }),
}))

import { consumeRateLimit } from "@/lib/security/rate-limit"

const rule = { scope: "test:scope", subject: "subject-1", limit: 10, windowSeconds: 60 }

describe("consumeRateLimit fails closed", () => {
  beforeEach(() => {
    state.rpcResult = { data: null, error: null }
    vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  it("denies when the rate-limit RPC errors", async () => {
    state.rpcResult = { data: null, error: { message: "connection refused" } }

    const result = await consumeRateLimit(rule)

    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("denies when the RPC succeeds but returns no row", async () => {
    state.rpcResult = { data: [], error: null }

    const result = await consumeRateLimit(rule)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it("passes through an allowed row", async () => {
    state.rpcResult = {
      data: [{ allowed: true, total_count: 1, remaining: 9, retry_after_seconds: 0 }],
      error: null,
    }

    const result = await consumeRateLimit(rule)

    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(9)
  })

  it("passes through a denied row with retry-after", async () => {
    state.rpcResult = {
      data: [{ allowed: false, total_count: 11, remaining: 0, retry_after_seconds: 42 }],
      error: null,
    }

    const result = await consumeRateLimit(rule)

    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBe(42)
  })
})
