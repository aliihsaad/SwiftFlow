import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function apiSource(...segments: string[]) {
  return source("app", "api", ...segments)
}

function developerV1(...segments: string[]) {
  return apiSource("developer", "v1", ...segments)
}

function expectWorkspaceFilter(fileSource: string, workspaceExpression: string) {
  expect(fileSource).toContain(`.eq("workspace_id", ${workspaceExpression})`)
}

describe("workspace object ownership contracts", () => {
  it("keeps Developer API post and draft routes pinned to the authenticated workspace", () => {
    const posts = developerV1("posts", "route.ts")
    expectWorkspaceFilter(posts, "context.workspaceId")
    expect(posts).toContain("workspace_id: context.workspaceId")
    expect(posts).toContain("sanitizePostPayload")

    const drafts = developerV1("posts", "drafts", "route.ts")
    expectWorkspaceFilter(drafts, "context.workspaceId")
    expect(drafts).toContain(".in(\"status\", [\"draft\", \"scheduled\"])")
    expect(drafts).toContain("workspace_id: context.workspaceId")
    expect(drafts).toContain("sanitizePostPayload")

    const draftById = developerV1("posts", "drafts", "[id]", "route.ts")
    expect(draftById).toContain("assertUuid(id, \"post id\")")
    expect(draftById.match(/\.eq\("id", postId\)/g)).toHaveLength(4)
    expect(draftById.match(/\.eq\("workspace_id", context\.workspaceId\)/g)).toHaveLength(4)
    expect(draftById.match(/\.in\("status", \["draft", "scheduled"\]\)/g)).toHaveLength(4)
    expect(draftById).not.toContain("workspace_id: raw")
  })

  it("keeps Developer API media routes pinned to workspace-owned storage paths and posts", () => {
    const media = developerV1("media", "route.ts")
    expect(media).toContain("buildStoragePath(context.workspaceId")
    expect(media).toContain("return `${workspaceId}/developer-api/${Date.now()}-${randomUUID()}.${extension}`")
    expect(media).toContain("parseBase64Media")

    const mediaGenerate = developerV1("media", "generate", "route.ts")
    expect(mediaGenerate).toContain("buildStoragePath(context.workspaceId")
    expect(mediaGenerate).toContain("return `${workspaceId}/developer-api/generated/${Date.now()}-${randomUUID()}.${extension}`")
    expect(mediaGenerate.match(/\.eq\("workspace_id", context\.workspaceId\)/g)).toHaveLength(2)
    expect(mediaGenerate).toContain("getExistingMediaUrls(post.media_urls)")
    expect(mediaGenerate).toContain("validateRemoteImageUrl")
  })

  it("keeps Developer API brand, analytics, and content intelligence routes workspace-scoped", () => {
    const brand = developerV1("brand-profile", "route.ts")
    expect(brand.match(/\.eq\("workspace_id", context\.workspaceId\)/g)).toHaveLength(3)
    expect(brand).toContain("workspace_id: context.workspaceId")
    expect(brand).toContain("sanitizePartialBrandProfilePayload")
    expect(brand).toContain("workspace_id: existing.workspace_id")

    const analytics = developerV1("analytics", "summary", "route.ts")
    expect(analytics).toContain("maybeSyncWorkspaceAnalytics({")
    expect(analytics).toContain("workspaceId: context.workspaceId")
    expect(analytics).toContain(".eq(\"workspace_id\", context.workspaceId)")

    const contentIntelligence = developerV1("content-intelligence", "analyze-post", "route.ts")
    expect(contentIntelligence).toContain("workspaceId: context.workspaceId")
    expect(contentIntelligence).toContain("maybeSyncWorkspaceAnalytics({ workspaceId: context.workspaceId })")
    expect(contentIntelligence).toContain("loadContentIntelligenceSignals(context.workspaceId)")
  })

  it("keeps Developer API automation routes scoped by workspace and validates linked social accounts", () => {
    const automations = developerV1("automations", "route.ts")
    expectWorkspaceFilter(automations, "context.workspaceId")
    expect(automations).toContain("workspace_id: context.workspaceId")
    expect(automations.match(/\.eq\("workspace_id", context\.workspaceId\)/g)).toHaveLength(2)
    expect(automations).toContain("validateDeveloperAutomationGraph(workflowGraph")
    expect(automations).toContain("expectedSocialAccountId: socialAccountId")

    const automationById = developerV1("automations", "[id]", "route.ts")
    expect(automationById).toContain("assertUuid(id, \"automation id\")")
    expect(automationById.match(/\.eq\("workspace_id", context\.workspaceId\)/g)).toHaveLength(6)
    expect(automationById).toContain("validateDeveloperAutomationGraph(workflowGraph")
    expect(automationById).toContain("Invalid social account for this workspace")

    const toggle = developerV1("automations", "[id]", "toggle", "route.ts")
    expect(toggle).toContain("assertUuid(id, \"automation id\")")
    expectWorkspaceFilter(toggle, "context.workspaceId")
  })

  it("keeps Developer API key management and assistant history scoped to the active workspace", () => {
    const keys = apiSource("developer", "keys", "route.ts")
    expect(keys).toContain("requireWorkspacePermission(supabase, user.id, activeWorkspace.id, \"settings:write\")")
    expect(keys).toContain(".eq(\"workspace_id\", manager.activeWorkspace.id)")
    expect(keys).toContain("workspace_id: manager.activeWorkspace.id")
    expect(keys).toContain("created_by_user_id: manager.user.id")

    const keyById = apiSource("developer", "keys", "[id]", "route.ts")
    expect(keyById).toContain("assertUuid(id, \"API key id\")")
    expect(keyById.match(/\.eq\("workspace_id", manager\.activeWorkspace\.id\)/g)).toHaveLength(4)
    expect(keyById).toContain("Only revoked API keys can be permanently deleted")

    const sessions = apiSource("chat", "sessions", "route.ts")
    expect(sessions).toContain("requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'workspace:read')")
    expect(sessions).toContain("requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')")
    expect(sessions).toContain(".eq('workspace_id', activeWorkspace.id)")
    expect(sessions).toContain("workspace_id: activeWorkspace.id")
    expect(sessions).toContain("user_id: user.id")

    const sessionById = apiSource("chat", "sessions", "[id]", "route.ts")
    expect(sessionById).toContain("assertUuid(params.id, 'chat session id')")
    expect(sessionById.match(/\.eq\('workspace_id', activeWorkspace\.id\)/g)).toHaveLength(3)
    expect(sessionById).toContain("requireWorkspacePermission(supabase, user.id, activeWorkspace.id, 'content:write')")
  })
})
