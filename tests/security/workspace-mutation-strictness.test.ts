import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

// Every API route with a mutation handler that resolves the workspace from the
// active-workspace cookie must use the strict resolver (no first-workspace fallback).
const MUTATION_ROUTES: string[][] = [
  ["app", "api", "ai", "generate-ideas", "route.ts"],
  ["app", "api", "ai", "validate-key", "route.ts"],
  ["app", "api", "automations", "process", "route.ts"],
  ["app", "api", "automations", "route.ts"],
  ["app", "api", "automations", "[id]", "route.ts"],
  ["app", "api", "automations", "[id]", "toggle", "route.ts"],
  ["app", "api", "brand-profile", "assets", "route.ts"],
  ["app", "api", "brand-profile", "route.ts"],
  ["app", "api", "chat", "sessions", "route.ts"],
  ["app", "api", "chat", "sessions", "[id]", "route.ts"],
  ["app", "api", "content-intelligence", "analyze-post", "route.ts"],
  ["app", "api", "content-intelligence", "trend-report", "route.ts"],
  ["app", "api", "developer", "access-model", "route.ts"],
  ["app", "api", "developer", "keys", "route.ts"],
  ["app", "api", "developer", "keys", "[id]", "route.ts"],
  ["app", "api", "live-messages", "send", "route.ts"],
  ["app", "api", "messages", "route.ts"],
  ["app", "api", "posts", "route.ts"],
  ["app", "api", "posts-media", "comments", "route.ts"],
  ["app", "api", "posts-media", "route.ts"],
  ["app", "api", "publishing-automations", "route.ts"],
  ["app", "api", "publishing-automations", "[id]", "route.ts"],
  ["app", "api", "publishing-automations", "[id]", "run-now", "route.ts"],
  ["app", "api", "publishing-automations", "[id]", "runs", "[runId]", "generate-image", "route.ts"],
  ["app", "api", "publishing-automations", "[id]", "toggle", "route.ts"],
  ["app", "api", "sync-analytics", "route.ts"],
]

describe("workspace mutation strictness", () => {
  it("mutation routes resolve the workspace strictly", () => {
    for (const segments of MUTATION_ROUTES) {
      const route = source(...segments)
      expect(route, segments.join("/")).toContain("getExplicitActiveWorkspace()")
    }
  })

  it("the strict resolver never falls back to the first workspace", () => {
    const utils = source("lib", "workspace-utils.ts")
    const strictFn = utils.slice(utils.indexOf("export async function getExplicitActiveWorkspace"))
    expect(strictFn.length).toBeGreaterThan(0)
    expect(strictFn).not.toContain("order('created_at'")
  })

  it("assistant workspace resolution rejects missing/invalid selection", () => {
    const auth = source("lib", "assistant", "auth.ts")
    expect(auth).not.toContain("memberships[0]")
    expect(auth).toContain("No workspace selected")
    expect(auth).toContain("No access to the selected workspace")
  })

  it("AI generation routes have no first-membership fallback", () => {
    for (const segments of [
      ["app", "api", "ai", "generate-caption", "route.ts"],
      ["app", "api", "ai", "generate-ideas", "route.ts"],
    ]) {
      const route = source(...segments)
      expect(route, segments.join("/")).not.toContain("firstMembership")
    }
  })

  it("messages GET only marks read state with an explicit workspace and scopes updates", () => {
    const route = source("app", "api", "messages", "route.ts")

    // Mark-read is a write: it must be gated on the strict resolver result.
    expect(route).toContain("const explicitWorkspace = await getExplicitActiveWorkspace()")
    expect(route).toContain("canMutateMessageState = explicitWorkspace !== null")

    // Both touched updates must carry a workspace_id filter.
    const markReadUpdate = route.indexOf(".update({ is_read: true })")
    expect(markReadUpdate).toBeGreaterThan(-1)
    const messagesScope = route.indexOf(".eq('workspace_id', activeWorkspace.id)", markReadUpdate)
    expect(messagesScope).toBeGreaterThan(markReadUpdate)

    const unreadUpdate = route.indexOf(".update({ unread_count: 0 })")
    expect(unreadUpdate).toBeGreaterThan(-1)
    const conversationScope = route.indexOf(".eq('workspace_id', activeWorkspace.id)", unreadUpdate)
    expect(conversationScope).toBeGreaterThan(unreadUpdate)

    const lastMessageRead = route.indexOf(".eq('conversation_id', conv.id)")
    expect(lastMessageRead).toBeGreaterThan(-1)
    const lastMessageReadScope = route.indexOf(".eq('workspace_id', activeWorkspace.id)", lastMessageRead)
    expect(lastMessageReadScope).toBeGreaterThan(lastMessageRead)

    const lastMessageAtUpdate = route.indexOf(".update({ last_message_at: new Date().toISOString() })")
    expect(lastMessageAtUpdate).toBeGreaterThan(-1)
    const lastMessageAtScope = route.indexOf(".eq('workspace_id', activeWorkspace.id)", lastMessageAtUpdate)
    expect(lastMessageAtScope).toBeGreaterThan(lastMessageAtUpdate)
  })

  it("settings write server actions require an explicit workspace selection", () => {
    const actions = source("app", "actions", "settings.ts")

    const fnBody = (name: string) => {
      const start = actions.indexOf(`export async function ${name}`)
      expect(start, name).toBeGreaterThan(-1)
      const end = actions.indexOf("export async function", start + 1)
      return actions.slice(start, end === -1 ? actions.length : end)
    }

    for (const writeAction of [
      "togglePageSelection",
      "updateCurrentWorkspaceSettings",
      "removeCurrentWorkspaceProviderKey",
    ]) {
      expect(fnBody(writeAction), writeAction).toContain("getExplicitActiveWorkspace()")
      expect(fnBody(writeAction), writeAction).not.toContain("getActiveWorkspace()")
    }

    const updateWorkspaceSettings = fnBody("updateWorkspaceSettings")
    expect(updateWorkspaceSettings).toContain("workspace_id: workspaceId")
    expect(updateWorkspaceSettings).not.toContain("...settings")

    const togglePageSelection = fnBody("togglePageSelection")
    const toggleUpdate = togglePageSelection.indexOf(".update({")
    expect(toggleUpdate).toBeGreaterThan(-1)
    const toggleWorkspaceScope = togglePageSelection.indexOf(".eq('workspace_id', activeWorkspace.id)", toggleUpdate)
    expect(toggleWorkspaceScope).toBeGreaterThan(toggleUpdate)

    // Read/display helpers keep the read resolver with its first-workspace fallback.
    for (const readHelper of ["getCurrentWorkspaceSettings", "getCurrentWorkspaceSettingsForDisplay"]) {
      expect(fnBody(readHelper), readHelper).toContain("getActiveWorkspace()")
      expect(fnBody(readHelper), readHelper).not.toContain("getExplicitActiveWorkspace()")
    }
  })

  it("generate-ideas is fully hardened", () => {
    const route = source("app", "api", "ai", "generate-ideas", "route.ts")

    expect(route).toContain("supabase.auth.getUser()")
    expect(route).toContain("assertJsonBodySize(request")
    expect(route).toContain("sanitizePlatformList(")
    expect(route).toContain("requireWorkspacePermission(")
    expect(route).toContain('scope: "ai:ideas:user"')
    expect(route).toContain('scope: "ai:ideas:ip"')
    expect(route).toContain("status: 429")
    expect(route).toContain("Retry-After")
    expect(route).toContain("redactSensitiveLogValue(error)")
  })
})
