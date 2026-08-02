import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

describe("Developer API runtime audit integration", () => {
  it("routes all active writes through the authenticated audit wrapper", () => {
    for (const route of [
      source("app", "api", "developer", "v1", "brand-profile", "route.ts"),
      source("app", "api", "developer", "v1", "automations", "route.ts"),
      source("app", "api", "developer", "v1", "automations", "[id]", "route.ts"),
      source("app", "api", "developer", "v1", "automations", "[id]", "toggle", "route.ts"),
    ]) {
      expect(route).toContain("withDeveloperApiAuth")
      expect(route).toContain("action:")
      expect(route).toContain("route:")
    }
  })
})
