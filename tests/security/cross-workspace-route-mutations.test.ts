import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

describe("cross-workspace route mutation guards", () => {
  it("brand profile writes use the verified active workspace, not body workspace ids", () => {
    const route = source("app", "api", "brand-profile", "route.ts")
    expect(route).toContain("getExplicitActiveWorkspace")
    expect(route).toContain("sanitizeBrandProfilePayload")
    expect(route).toContain("workspace_id: activeWorkspace.id")
    expect(route).toContain(".eq('workspace_id', activeWorkspace.id)")
  })

  it("workspace settings require permission for the sanitized workspace id", () => {
    const route = source("app", "api", "workspace", "settings", "route.ts")
    expect(route).toContain("sanitizeWorkspaceSettingsPayload")
    expect(route).toContain("requireWorkspacePermission(supabase, user.id, workspaceId, 'settings:write')")
  })

  it("automation reply calls resolve membership before provider invocation", () => {
    const route = source("app", "api", "assistant", "invoke", "route.ts")
    expect(route).toContain("resolveAssistantWorkspace")
    expect(route.indexOf("resolveAssistantWorkspace")).toBeLessThan(route.indexOf("invokeAssistantEdgeFunction"))
  })
})
