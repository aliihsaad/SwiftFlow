import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DEVELOPER_API_SCOPE_VALUES } from "@/lib/developer-api/types"
import { getDeveloperApiScopeOptions } from "@/lib/developer-api/scopes"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

const contracts = [
  ["workspace:read", "read", ["workspace", "route.ts"]],
  ["brand:read", "read", ["brand-profile", "route.ts"]],
  ["brand:write", "write", ["brand-profile", "route.ts"]],
  ["automations:read", "read", ["automations", "route.ts"]],
  ["automations:create", "automation_write", ["automations", "route.ts"]],
  ["automations:update", "automation_write", ["automations", "[id]", "route.ts"]],
  ["automations:delete", "automation_write", ["automations", "[id]", "route.ts"]],
  ["automations:toggle", "automation_write", ["automations", "[id]", "toggle", "route.ts"]],
  ["analytics:read", "analytics_refresh", ["analytics", "summary", "route.ts"]],
] as const

describe("developer API scope matrix", () => {
  it("keeps every declared scope visible in settings metadata", () => {
    expect(getDeveloperApiScopeOptions().map((option) => option.scope)).toEqual(DEVELOPER_API_SCOPE_VALUES)
  })

  it("documents exact scopes and rate-limit classes on active routes", () => {
    for (const [scope, rateLimit, segments] of contracts) {
      const route = source("app", "api", "developer", "v1", ...segments)
      expect(route).toContain('requiredScopes: ["' + scope + '"]')
      expect(route).toContain('rateLimit: "' + rateLimit + '"')
    }
  })

  it("does not expose retired publishing, media, or content-generation capabilities", () => {
    const retiredScopes = [
      "posts:read",
      "posts:create",
      "posts:schedule",
      "posts:publish_now",
      "posts:update",
      "posts:delete",
      "media:upload",
      "media:generate",
      "content_intelligence:run",
    ]

    for (const scope of retiredScopes) {
      expect(DEVELOPER_API_SCOPE_VALUES).not.toContain(scope)
    }

    const rateLimits = source("lib", "developer-api", "rate-limit.ts")
    expect(rateLimits).not.toContain("media_upload")
    expect(rateLimits).not.toContain("media_generate")
    expect(rateLimits).not.toContain("post_publish_now")
    expect(rateLimits).not.toContain("content_intelligence")
  })

  it("normalizes stored legacy key scopes without granting replacement access", () => {
    const migration = source(
      "supabase",
      "migrations",
      "20260802120000_cleanup_developer_api_legacy_scopes.sql"
    )

    for (const scope of DEVELOPER_API_SCOPE_VALUES) {
      expect(migration).toContain(`'${scope}'`)
    }

    expect(migration).toContain("legacy_scopes_removed")
    expect(migration).toContain("cardinality(normalized.supported_scopes) = 0")
    expect(migration).toContain("status <> 'active'")
    expect(migration).not.toContain("'posts:")
    expect(migration).not.toContain("'media:")
    expect(migration).not.toContain("'content_intelligence:")
  })
})
