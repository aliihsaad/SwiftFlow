import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

describe("app expensive route rate limits", () => {
  it("rate limits assistant invocation routes by user/workspace and IP", () => {
    for (const route of [
      source("app", "api", "assistant", "command", "route.ts"),
      source("app", "api", "assistant", "invoke", "route.ts"),
    ]) {
      expect(route).toContain("enforceRateLimit(")
      expect(route).toContain("getClientIp(request)")
      expect(route).toContain("workspace.userId")
      expect(route).toContain("workspace.workspaceId")
      expect(route).toContain("RateLimitExceededError")
      expect(route).toContain("status: 429")
      expect(route).toContain("Retry-After")
      expect(route).toContain("redactSensitiveLogValue(error)")
    }
  })

  it("rate limits trend research by workspace user and IP before provider calls", () => {
    const route = source("app", "api", "content-intelligence", "trend-report", "route.ts")

    expect(route).toContain("assertJsonBodySize(request)")
    expect(route).toContain("getClientIp(request)")
    expect(route).toContain('scope: "content-intelligence:trend-report:user"')
    expect(route).toContain("subject: `${user.id}:${activeWorkspace.id}`")
    expect(route).toContain('scope: "content-intelligence:trend-report:ip"')
    expect(route.indexOf("await enforceRateLimit(")).toBeLessThan(route.indexOf("await buildTrendReport({"))
    expect(route).toContain("RateLimitExceededError")
    expect(route).toContain("status: 429")
    expect(route).toContain("redactSensitiveLogValue(error)")
  })
})
