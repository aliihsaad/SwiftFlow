import { NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type AuthContext = {
  workspaceId: string
  apiKeyId: string
  keyPrefix: string
  scopes: string[]
  roleSnapshot: string
}

const state = vi.hoisted(() => ({
  authContext: {
    workspaceId: "workspace-1",
    apiKeyId: "api-key-1",
    keyPrefix: "sf_live_testprefix1",
    scopes: ["posts:create"],
    roleSnapshot: "owner",
  } as AuthContext,
  authError: null as Error | null,
  auditCalls: [] as Array<Record<string, unknown>>,
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
    authenticateDeveloperApiRequest: async () => {
      if (state.authError) throw state.authError
      return state.authContext
    },
  }
})

vi.mock("@/lib/developer-api/audit", () => ({
  getDeveloperApiRequestId: () => "req_phase1_audit",
  writeDeveloperApiAuditLog: async (params: Record<string, unknown>) => {
    state.auditCalls.push(params)
  },
}))

vi.mock("@/lib/security/rate-limit", () => ({
  RateLimitExceededError: class RateLimitExceededError extends Error {
    retryAfterSeconds: number
    constructor(message: string, retryAfterSeconds = 1) {
      super(message)
      this.retryAfterSeconds = retryAfterSeconds
    }
  },
}))

import { DeveloperApiAuthError } from "@/lib/developer-api/auth"
import { withDeveloperApiAuth } from "@/lib/developer-api/http"

describe("Developer API audit wrapper", () => {
  beforeEach(() => {
    state.authError = null
    state.auditCalls = []
  })

  it("adds request id headers and writes success audit records for write actions", async () => {
    const response = await withDeveloperApiAuth(
      new Request("https://social.swiftdigital-s.com/api/developer/v1/posts", { method: "POST" }),
      {
        requiredScopes: ["posts:create"],
        rateLimit: "write",
        action: "posts.create",
        route: "/api/developer/v1/posts",
      },
      async (context) => NextResponse.json({ workspaceId: context.workspaceId }, { status: 201 }),
    )

    await expect(response.json()).resolves.toEqual({ workspaceId: "workspace-1" })
    expect(response.status).toBe(201)
    expect(response.headers.get("x-request-id")).toBe("req_phase1_audit")
    expect(state.auditCalls).toHaveLength(1)
    expect(state.auditCalls[0]).toMatchObject({
      requestId: "req_phase1_audit",
      context: state.authContext,
      action: "posts.create",
      route: "/api/developer/v1/posts",
      scopesRequired: ["posts:create"],
      statusCode: 201,
    })
  })

  it("writes failure audit records without a context when authentication fails", async () => {
    state.authError = new DeveloperApiAuthError("Missing required scope: posts:delete", 403, "missing_scope", "sf_live_testprefix1")

    const response = await withDeveloperApiAuth(
      new Request("https://social.swiftdigital-s.com/api/developer/v1/posts/drafts/post-1", { method: "DELETE" }),
      {
        requiredScopes: ["posts:delete"],
        rateLimit: "write",
        action: "posts.drafts.delete",
        route: "/api/developer/v1/posts/drafts/:id",
      },
      async () => NextResponse.json({ shouldNotRun: true }),
    )

    await expect(response.json()).resolves.toMatchObject({
      code: "missing_scope",
      error: "Missing required scope: posts:delete",
      requestId: "req_phase1_audit",
    })
    expect(response.status).toBe(403)
    expect(response.headers.get("x-request-id")).toBe("req_phase1_audit")
    expect(state.auditCalls).toHaveLength(1)
    expect(state.auditCalls[0]).toMatchObject({
      requestId: "req_phase1_audit",
      context: null,
      keyPrefix: "sf_live_testprefix1",
      action: "posts.drafts.delete",
      route: "/api/developer/v1/posts/drafts/:id",
      scopesRequired: ["posts:delete"],
      statusCode: 403,
      errorCode: "missing_scope",
    })
  })
})
