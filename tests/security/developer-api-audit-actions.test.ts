import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

function developerV1(...segments: string[]) {
  return source("app", "api", "developer", "v1", ...segments)
}

function expectRouteAction(
  fileSource: string,
  contract: { action: string; route: string; scope: string; rateLimit?: string },
) {
  expect(fileSource).toContain(`action: "${contract.action}"`)
  expect(fileSource).toContain(`route: "${contract.route}"`)
  expect(fileSource).toContain(contract.scope)
  if (contract.rateLimit) {
    expect(fileSource).toContain(`rateLimit: "${contract.rateLimit}"`)
  }
}

describe("Developer API route action audit contracts", () => {
  it("keeps post create, schedule, publish, draft update, and draft delete actions explicit", () => {
    const posts = developerV1("posts", "route.ts")
    expect(posts).toContain('action: requestedStatus === "published" ? "posts.publish_now" : requestedStatus === "scheduled" ? "posts.schedule" : "posts.create"')
    expect(posts).toContain('if (status === "scheduled") return "posts:schedule"')
    expect(posts).toContain('if (status === "published") return "posts:publish_now"')
    expect(posts).toContain('rateLimit: requestedStatus === "published" ? "post_publish_now" : "write"')
    expect(posts).toContain('route: "/api/developer/v1/posts"')

    const drafts = developerV1("posts", "drafts", "route.ts")
    expectRouteAction(drafts, {
      action: "posts.drafts.create",
      route: "/api/developer/v1/posts/drafts",
      scope: 'requiredScopes: ["posts:create"]',
      rateLimit: "write",
    })

    const draftById = developerV1("posts", "drafts", "[id]", "route.ts")
    expectRouteAction(draftById, {
      action: "posts.drafts.update",
      route: "/api/developer/v1/posts/drafts/:id",
      scope: 'requiredScopes: ["posts:update"]',
      rateLimit: "write",
    })
    expectRouteAction(draftById, {
      action: "posts.drafts.delete",
      route: "/api/developer/v1/posts/drafts/:id",
      scope: 'requiredScopes: ["posts:delete"]',
      rateLimit: "write",
    })
  })

  it("keeps brand profile and media write actions explicit", () => {
    const brand = developerV1("brand-profile", "route.ts")
    expectRouteAction(brand, {
      action: "brand_profile.write",
      route: "/api/developer/v1/brand-profile",
      scope: 'requiredScopes: ["brand:write"]',
      rateLimit: "write",
    })

    const media = developerV1("media", "route.ts")
    expectRouteAction(media, {
      action: "media.upload",
      route: "/api/developer/v1/media",
      scope: 'requiredScopes: ["media:upload"]',
      rateLimit: "media_upload",
    })

    const mediaGenerate = developerV1("media", "generate", "route.ts")
    expect(mediaGenerate).toContain('action: hasAttachTarget(raw) ? "media.generate.attach" : "media.generate"')
    expect(mediaGenerate).toContain('postId ? ["media:generate", "posts:update"] : ["media:generate"]')
    expect(mediaGenerate).toContain('rateLimit: "media_generate"')
    expect(mediaGenerate).toContain('route: "/api/developer/v1/media/generate"')
  })

  it("keeps automation write and destructive actions explicit", () => {
    const automations = developerV1("automations", "route.ts")
    expectRouteAction(automations, {
      action: "automations.create",
      route: "/api/developer/v1/automations",
      scope: 'requiredScopes: ["automations:create"]',
      rateLimit: "automation_write",
    })

    const automationById = developerV1("automations", "[id]", "route.ts")
    expectRouteAction(automationById, {
      action: "automations.update",
      route: "/api/developer/v1/automations/:id",
      scope: 'requiredScopes: ["automations:update"]',
      rateLimit: "automation_write",
    })
    expectRouteAction(automationById, {
      action: "automations.delete",
      route: "/api/developer/v1/automations/:id",
      scope: 'requiredScopes: ["automations:delete"]',
      rateLimit: "automation_write",
    })

    const toggle = developerV1("automations", "[id]", "toggle", "route.ts")
    expectRouteAction(toggle, {
      action: "automations.toggle",
      route: "/api/developer/v1/automations/:id/toggle",
      scope: 'requiredScopes: ["automations:toggle"]',
      rateLimit: "automation_write",
    })
  })
})
