import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const developerV1 = (...segments: string[]) =>
  readFileSync(path.join(root, "app", "api", "developer", "v1", ...segments), "utf8")

describe("Developer API route action audit contracts", () => {
  it("keeps brand write actions explicit", () => {
    const route = developerV1("brand-profile", "route.ts")
    expect(route).toContain('action: "brand_profile.write"')
    expect(route).toContain('route: "/api/developer/v1/brand-profile"')
  })

  it("keeps automation write and destructive actions explicit", () => {
    const collection = developerV1("automations", "route.ts")
    expect(collection).toContain('action: "automations.create"')

    const byId = developerV1("automations", "[id]", "route.ts")
    expect(byId).toContain('action: "automations.update"')
    expect(byId).toContain('action: "automations.delete"')

    const toggle = developerV1("automations", "[id]", "toggle", "route.ts")
    expect(toggle).toContain('action: "automations.toggle"')
  })
})
