import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The dashboard automation routes must honor broad comment-trigger scopes
 * (any / any_post / any_reel) the same way the developer API and the
 * orchestrator do. Regression guard for the canvas "Save" being blocked with
 * "Comment trigger requires a post ID." on any-comment automations.
 */

const root = process.cwd()

const ROUTES = [
  path.join("app", "api", "automations", "route.ts"),
  path.join("app", "api", "automations", "[id]", "route.ts"),
  path.join("app", "api", "automations", "validate", "route.ts"),
]

describe("comment trigger scope alignment", () => {
  for (const route of ROUTES) {
    it(`${route} resolves post scope instead of unconditionally requiring post_id`, () => {
      const source = readFileSync(path.join(root, route), "utf8")
      expect(source).toContain("resolveCommentPostScope")
    })
  }

  it("save routes store the shared __canvas__ sentinel for broad scopes", () => {
    for (const route of ROUTES.slice(0, 2)) {
      const source = readFileSync(path.join(root, route), "utf8")
      expect(source).toMatch(/["']__canvas__["']/)
    }
  })
})
