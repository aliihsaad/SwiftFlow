import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const route = readFileSync(
  path.join(process.cwd(), "app", "api", "cron", "scheduler", "route.ts"),
  "utf8",
)

describe("cron scheduler auth", () => {
  it("requires CRON_SECRET and never trusts spoofable cron headers", () => {
    expect(route).toContain("process.env.CRON_SECRET")
    expect(route).not.toMatch(/headers\.get\(['"]x-vercel-cron/)
  })

  it("fails closed in production when CRON_SECRET is missing", () => {
    expect(route).toContain("process.env.NODE_ENV === 'production'")
    expect(route).toMatch(/NODE_ENV === 'production'\)\s*\{[^}]*return false/)
  })
})
