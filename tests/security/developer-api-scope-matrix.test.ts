import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEVELOPER_API_SCOPE_VALUES, type DeveloperApiScope } from "@/lib/developer-api/types"
import { getDeveloperApiScopeOptions } from "@/lib/developer-api/scopes"

const state = vi.hoisted(() => ({
  apiKeyRow: null as Record<string, unknown> | null,
  updates: [] as Array<{ table: string; payload: Record<string, unknown>; filters: Record<string, unknown> }>,
  rateLimitCalls: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/utils/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => {
          filters[key] = value
          return query
        },
        maybeSingle: async () => {
          if (table === "workspace_api_keys") return { data: state.apiKeyRow, error: null }
          if (table === "workspace_entitlements") return { data: { developer_api_enabled: true }, error: null }
          return { data: null, error: null }
        },
        update: (payload: Record<string, unknown>) => {
          state.updates.push({ table, payload, filters })
          return query
        },
        insert: (payload: Record<string, unknown>) => {
          state.updates.push({ table, payload, filters })
          return { error: null }
        },
      }
      return query
    },
  }),
}))

vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: async (params: Record<string, unknown>) => {
    state.rateLimitCalls.push(params)
    return { allowed: true, remaining: 99, retryAfterSeconds: 0 }
  },
  getClientIp: () => "203.0.113.10",
  RateLimitExceededError: class RateLimitExceededError extends Error {
    retryAfterSeconds: number
    constructor(message: string, retryAfterSeconds = 1) {
      super(message)
      this.retryAfterSeconds = retryAfterSeconds
    }
  },
}))

import { authenticateDeveloperApiRequest } from "@/lib/developer-api/auth"
import { createDeveloperApiToken, hashDeveloperApiToken } from "@/lib/developer-api/key-format"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function routeSource(...segments: string[]) {
  return source("app", "api", "developer", "v1", ...segments)
}

function createActiveApiKey(scopes: DeveloperApiScope[], overrides: Partial<Record<string, unknown>> = {}) {
  const token = createDeveloperApiToken()
  state.apiKeyRow = {
    id: "api-key-1",
    workspace_id: "workspace-1",
    key_prefix: token.prefix,
    key_hash: hashDeveloperApiToken(token.plaintext, "phase-1-test-pepper"),
    scopes,
    status: "active",
    created_by_role_snapshot: "owner",
    expires_at: null,
    ...overrides,
  }
  return token
}

function bearerRequest(token: string, url = "https://social.swiftdigital-s.com/api/developer/v1/brand-profile") {
  return new Request(url, {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })
}

type RouteScopeContract = {
  name: string
  url: string
  requiredScopes: DeveloperApiScope[]
  rateLimit: Parameters<typeof authenticateDeveloperApiRequest>[2]
}

const ROUTE_SCOPE_CONTRACTS: RouteScopeContract[] = [
  {
    name: "GET /workspace",
    url: "https://social.swiftdigital-s.com/api/developer/v1/workspace",
    requiredScopes: ["workspace:read"],
    rateLimit: "read",
  },
  {
    name: "GET /brand-profile",
    url: "https://social.swiftdigital-s.com/api/developer/v1/brand-profile",
    requiredScopes: ["brand:read"],
    rateLimit: "read",
  },
  {
    name: "PATCH /brand-profile",
    url: "https://social.swiftdigital-s.com/api/developer/v1/brand-profile",
    requiredScopes: ["brand:write"],
    rateLimit: "write",
  },
  {
    name: "GET /posts",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts",
    requiredScopes: ["posts:read"],
    rateLimit: "read",
  },
  {
    name: "POST /posts draft",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts",
    requiredScopes: ["posts:create"],
    rateLimit: "write",
  },
  {
    name: "POST /posts scheduled",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts",
    requiredScopes: ["posts:schedule"],
    rateLimit: "write",
  },
  {
    name: "POST /posts publish now",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts",
    requiredScopes: ["posts:publish_now"],
    rateLimit: "post_publish_now",
  },
  {
    name: "GET /posts/drafts",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts/drafts",
    requiredScopes: ["posts:read"],
    rateLimit: "read",
  },
  {
    name: "POST /posts/drafts",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts/drafts",
    requiredScopes: ["posts:create"],
    rateLimit: "write",
  },
  {
    name: "PATCH /posts/drafts/:id",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts/drafts/draft-1",
    requiredScopes: ["posts:update"],
    rateLimit: "write",
  },
  {
    name: "DELETE /posts/drafts/:id",
    url: "https://social.swiftdigital-s.com/api/developer/v1/posts/drafts/draft-1",
    requiredScopes: ["posts:delete"],
    rateLimit: "write",
  },
  {
    name: "POST /media",
    url: "https://social.swiftdigital-s.com/api/developer/v1/media",
    requiredScopes: ["media:upload"],
    rateLimit: "media_upload",
  },
  {
    name: "POST /media/generate",
    url: "https://social.swiftdigital-s.com/api/developer/v1/media/generate",
    requiredScopes: ["media:generate"],
    rateLimit: "media_generate",
  },
  {
    name: "POST /media/generate attach",
    url: "https://social.swiftdigital-s.com/api/developer/v1/media/generate",
    requiredScopes: ["media:generate", "posts:update"],
    rateLimit: "media_generate",
  },
  {
    name: "GET /analytics/summary",
    url: "https://social.swiftdigital-s.com/api/developer/v1/analytics/summary",
    requiredScopes: ["analytics:read"],
    rateLimit: "analytics_refresh",
  },
  {
    name: "POST /content-intelligence/analyze-post",
    url: "https://social.swiftdigital-s.com/api/developer/v1/content-intelligence/analyze-post",
    requiredScopes: ["content_intelligence:run"],
    rateLimit: "content_intelligence",
  },
  {
    name: "GET /automations",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
  {
    name: "POST /automations",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations",
    requiredScopes: ["automations:create"],
    rateLimit: "automation_write",
  },
  {
    name: "GET /automations/:id",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations/automation-1",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
  {
    name: "PATCH /automations/:id",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations/automation-1",
    requiredScopes: ["automations:update"],
    rateLimit: "automation_write",
  },
  {
    name: "DELETE /automations/:id",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations/automation-1",
    requiredScopes: ["automations:delete"],
    rateLimit: "automation_write",
  },
  {
    name: "POST /automations/:id/toggle",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automations/automation-1/toggle",
    requiredScopes: ["automations:toggle"],
    rateLimit: "automation_write",
  },
  {
    name: "GET /social-accounts",
    url: "https://social.swiftdigital-s.com/api/developer/v1/social-accounts",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
  {
    name: "GET /automation-media",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automation-media",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
  {
    name: "GET /automation-templates",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automation-templates",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
  {
    name: "GET /automation-node-catalog",
    url: "https://social.swiftdigital-s.com/api/developer/v1/automation-node-catalog",
    requiredScopes: ["automations:read"],
    rateLimit: "read",
  },
]

function scopesExcept(scope: DeveloperApiScope) {
  return DEVELOPER_API_SCOPE_VALUES.filter((candidate) => candidate !== scope)
}

describe("developer API scope matrix", () => {
  beforeEach(() => {
    vi.stubEnv("DEVELOPER_API_ACCESS_MODE", "preview")
    vi.stubEnv("DEVELOPER_API_KEY_PEPPER", "phase-1-test-pepper")
    state.apiKeyRow = null
    state.updates = []
    state.rateLimitCalls = []
  })

  it("keeps every declared scope visible in settings/UI metadata", () => {
    const scopes = [...DEVELOPER_API_SCOPE_VALUES]
    expect(new Set(scopes).size).toBe(scopes.length)
    expect(getDeveloperApiScopeOptions().map((option) => option.scope)).toEqual(scopes)
  })

  it("documents the exact scopes and rate-limit classes used by Developer API routes", () => {
    expect(routeSource("workspace", "route.ts")).toContain('requiredScopes: ["workspace:read"]')
    expect(routeSource("workspace", "route.ts")).toContain('rateLimit: "read"')

    const brand = routeSource("brand-profile", "route.ts")
    expect(brand).toContain('requiredScopes: ["brand:read"]')
    expect(brand).toContain('requiredScopes: ["brand:write"]')

    const posts = routeSource("posts", "route.ts")
    expect(posts).toContain('if (status === "scheduled") return "posts:schedule"')
    expect(posts).toContain('if (status === "published") return "posts:publish_now"')
    expect(posts).toContain('return "posts:create"')
    expect(posts).toContain('rateLimit: requestedStatus === "published" ? "post_publish_now" : "write"')

    const drafts = routeSource("posts", "drafts", "route.ts")
    expect(drafts).toContain('requiredScopes: ["posts:read"]')
    expect(drafts).toContain('requiredScopes: ["posts:create"]')

    const draftById = routeSource("posts", "drafts", "[id]", "route.ts")
    expect(draftById).toContain('requiredScopes: ["posts:update"]')
    expect(draftById).toContain('requiredScopes: ["posts:delete"]')

    const media = routeSource("media", "route.ts")
    expect(media).toContain('requiredScopes: ["media:upload"]')
    expect(media).toContain('rateLimit: "media_upload"')

    const mediaGenerate = routeSource("media", "generate", "route.ts")
    expect(mediaGenerate).toContain('postId ? ["media:generate", "posts:update"] : ["media:generate"]')
    expect(mediaGenerate).toContain('rateLimit: "media_generate"')

    const analytics = routeSource("analytics", "summary", "route.ts")
    expect(analytics).toContain('requiredScopes: ["analytics:read"]')
    expect(analytics).toContain('rateLimit: "analytics_refresh"')

    const contentIntelligence = routeSource("content-intelligence", "analyze-post", "route.ts")
    expect(contentIntelligence).toContain('requiredScopes: ["content_intelligence:run"]')
    expect(contentIntelligence).toContain('rateLimit: "content_intelligence"')

    const automations = routeSource("automations", "route.ts")
    expect(automations).toContain('requiredScopes: ["automations:read"]')
    expect(automations).toContain('requiredScopes: ["automations:create"]')
    expect(automations).toContain('rateLimit: "automation_write"')

    const automationById = routeSource("automations", "[id]", "route.ts")
    expect(automationById).toContain('requiredScopes: ["automations:read"]')
    expect(automationById).toContain('requiredScopes: ["automations:update"]')
    expect(automationById).toContain('requiredScopes: ["automations:delete"]')
    expect(automationById.match(/rateLimit: "automation_write"/g)).toHaveLength(2)

    const automationToggle = routeSource("automations", "[id]", "toggle", "route.ts")
    expect(automationToggle).toContain('requiredScopes: ["automations:toggle"]')
    expect(automationToggle).toContain('rateLimit: "automation_write"')
  })

  it("rejects query-string API keys before route handling", async () => {
    await expect(
      authenticateDeveloperApiRequest(
        new Request("https://social.swiftdigital-s.com/api/developer/v1/workspace?api_key=sf_live_leaked"),
        ["workspace:read"],
        "read",
      ),
    ).rejects.toMatchObject({
      status: 401,
      code: "query_token_rejected",
    })
    expect(state.rateLimitCalls).toEqual([])
  })

  it("rejects invalid, inactive, expired, and under-scoped API keys", async () => {
    await expect(
      authenticateDeveloperApiRequest(bearerRequest("not-a-valid-token"), ["brand:read"], "read"),
    ).rejects.toMatchObject({
      status: 401,
      code: "invalid_token_format",
    })
    expect(state.rateLimitCalls.at(-1)).toMatchObject({ scope: "developer_api:failed_auth" })

    const revoked = createActiveApiKey(["brand:read"], { status: "revoked" })
    await expect(authenticateDeveloperApiRequest(bearerRequest(revoked.plaintext), ["brand:read"], "read")).rejects.toMatchObject({
      status: 401,
      code: "inactive_key",
      keyPrefix: revoked.prefix,
    })

    const expired = createActiveApiKey(["brand:read"], { expires_at: "2000-01-01T00:00:00.000Z" })
    await expect(authenticateDeveloperApiRequest(bearerRequest(expired.plaintext), ["brand:read"], "read")).rejects.toMatchObject({
      status: 401,
      code: "expired_key",
      keyPrefix: expired.prefix,
    })
    expect(state.updates).toContainEqual(expect.objectContaining({
      table: "workspace_api_keys",
      payload: expect.objectContaining({ status: "expired" }),
    }))

    const readOnly = createActiveApiKey(["brand:read"])
    await expect(authenticateDeveloperApiRequest(bearerRequest(readOnly.plaintext), ["brand:write"], "write")).rejects.toMatchObject({
      status: 403,
      code: "missing_scope",
      keyPrefix: readOnly.prefix,
    })
  })

  it("rejects every route contract when any exact required scope is missing", async () => {
    expect(ROUTE_SCOPE_CONTRACTS.length).toBeGreaterThan(20)

    for (const contract of ROUTE_SCOPE_CONTRACTS) {
      for (const missingScope of contract.requiredScopes) {
        const token = createActiveApiKey(scopesExcept(missingScope))

        await expect(
          authenticateDeveloperApiRequest(
            bearerRequest(token.plaintext, contract.url),
            contract.requiredScopes,
            contract.rateLimit,
          ),
          `${contract.name} should reject without ${missingScope}`,
        ).rejects.toMatchObject({
          status: 403,
          code: "missing_scope",
          keyPrefix: token.prefix,
        })
      }
    }
  })

  it("accepts a valid key only when the exact scope is present and records scoped rate usage", async () => {
    const token = createActiveApiKey(["brand:write", "media:generate"])

    await expect(
      authenticateDeveloperApiRequest(bearerRequest(token.plaintext), ["media:generate"], "media_generate"),
    ).resolves.toMatchObject({
      workspaceId: "workspace-1",
      apiKeyId: "api-key-1",
      keyPrefix: token.prefix,
      scopes: ["brand:write", "media:generate"],
    })

    expect(state.rateLimitCalls.at(-1)).toMatchObject({
      scope: "developer_api:media_generate",
      subject: `media_generate:workspace:workspace-1:key:api-key-1`,
      limit: 5,
      windowSeconds: 60,
    })
    expect(state.updates).toContainEqual(expect.objectContaining({
      table: "workspace_api_keys",
      payload: expect.objectContaining({
        last_used_at: expect.any(String),
        updated_at: expect.any(String),
      }),
    }))
  })
})
