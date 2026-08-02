import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

describe("app expensive route rate limits", () => {
  it("rate limits automation reply invocation by user, workspace, and IP", () => {
    const route = source("app", "api", "assistant", "invoke", "route.ts")
    expect(route).toContain("enforceRateLimit(")
    expect(route).toContain("getClientIp(request)")
    expect(route).toContain("workspace.userId")
    expect(route).toContain("workspace.workspaceId")
    expect(route).toContain("RateLimitExceededError")
    expect(route).toContain("status: 429")
    expect(route).toContain("Retry-After")
    expect(route).toContain("redactSensitiveLogValue(error)")
  })

  it("rate limits trend research before provider calls", () => {
    const route = source("app", "api", "content-intelligence", "trend-report", "route.ts")
    expect(route).toContain("assertJsonBodySize(request)")
    expect(route).toContain("getClientIp(request)")
    expect(route.indexOf("await enforceRateLimit(")).toBeLessThan(route.indexOf("await buildTrendReport({"))
    expect(route).toContain("status: 429")
  })
})
