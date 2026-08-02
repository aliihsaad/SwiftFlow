import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")
const developerV1 = (...segments: string[]) => source("app", "api", "developer", "v1", ...segments)

describe("workspace object ownership contracts", () => {
  it("keeps brand and analytics reads pinned to the authenticated workspace", () => {
    const brand = developerV1("brand-profile", "route.ts")
    expect(brand).toContain('.eq("workspace_id", context.workspaceId)')
    expect(brand).toContain("workspace_id: context.workspaceId")

    const analytics = developerV1("analytics", "summary", "route.ts")
    expect(analytics).toContain('.eq("workspace_id", context.workspaceId)')
    expect(analytics).toContain("workspaceId: context.workspaceId")
  })

  it("keeps automation CRUD and linked accounts pinned to the authenticated workspace", () => {
    const collection = developerV1("automations", "route.ts")
    expect(collection).toContain('.eq("workspace_id", context.workspaceId)')
    expect(collection).toContain("workspace_id: context.workspaceId")
    expect(collection).toContain("Invalid social account for this workspace")

    const byId = developerV1("automations", "[id]", "route.ts")
    expect(byId).toContain('.eq("workspace_id", context.workspaceId)')
    expect(byId).toContain("Invalid social account for this workspace")
  })

  it("keeps Developer API key management pinned to the explicit active workspace", () => {
    const keys = source("app", "api", "developer", "keys", "route.ts")
    expect(keys).toContain("getExplicitActiveWorkspace")
    expect(keys).toContain('.eq("workspace_id", manager.activeWorkspace.id)')
    expect(keys).toContain("workspace_id: manager.activeWorkspace.id")
  })
})
