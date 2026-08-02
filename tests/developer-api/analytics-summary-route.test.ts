import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const routeSource = readFileSync(
  path.join(process.cwd(), "app/api/developer/v1/analytics/summary/route.ts"),
  "utf8",
)

describe("developer API analytics summary route", () => {
  it("requires analytics access and reads only provider analytics data", () => {
    expect(routeSource).toContain('requiredScopes: ["analytics:read"]')
    expect(routeSource).toContain('from("social_accounts")')
    expect(routeSource).toContain('from("account_analytics")')
    expect(routeSource).toContain('from("published_posts")')
    expect(routeSource).toContain('from("post_analytics")')
    expect(routeSource).not.toContain('from("posts")')
  })

  it("keeps read-through analytics synchronization without draft or scheduling counts", () => {
    expect(routeSource).toContain("maybeSyncWorkspaceAnalytics")
    expect(routeSource).toContain("analyticsSync")
    expect(routeSource).not.toContain("draftPosts")
    expect(routeSource).not.toContain("scheduledPosts")
  })
})
