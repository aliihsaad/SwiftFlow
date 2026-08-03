import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const source = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8")

describe("workspace mutation strictness", () => {
  it("automation reply invocation resolves and overwrites workspace identity", () => {
    const route = source("app", "api", "assistant", "invoke", "route.ts")
    expect(route).toContain("resolveAssistantWorkspace(request, body?.workspaceId)")
    expect(route).toContain("workspaceId: workspace.workspaceId")
    expect(route).toContain("sanitizeAssistantInvokePayload")
  })

  it("messages only mutate read state with an explicit workspace", () => {
    const route = source("app", "api", "messages", "route.ts")
    expect(route).toContain("getExplicitActiveWorkspace")
    expect(route).toContain("canMutateMessageState")
    expect(route).toContain(".eq('workspace_id', activeWorkspace.id)")
  })

  it("workspace settings validate membership and sanitize writes", () => {
    const route = source("app", "api", "workspace", "settings", "route.ts")
    expect(route).toContain("sanitizeWorkspaceSettingsPayload")
    expect(route).toContain("requireWorkspacePermission")
    expect(route).toContain(".eq('workspace_id', workspaceId)")
  })

  it("settings actions verify the selected workspace before writing", () => {
    const actions = source("app", "actions", "settings.ts")
    expect(actions).toMatch(/\.eq\(["']workspace_id["'],\s*workspaceId\)/)
    expect(actions).toMatch(
      /requireWorkspacePermission\(\s*supabase,\s*user\.id,\s*workspaceId,\s*["']settings:write["'],?\s*\)/,
    )
  })
})
