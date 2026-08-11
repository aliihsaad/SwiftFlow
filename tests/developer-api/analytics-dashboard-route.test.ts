import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const routeSource = readFileSync(
    path.join(process.cwd(), "app/api/analytics/route.ts"),
    "utf8",
)
const pageSource = readFileSync(
    path.join(process.cwd(), "app/dashboard/analytics/page.tsx"),
    "utf8",
)

describe("analytics dashboard data contract", () => {
    it("queries columns that exist in the managed Supabase analytics schema", () => {
        expect(routeSource).toContain("platform_caption, permalink, published_at')")
        expect(routeSource).toContain("likes, comments, shares, views, synced_at')")
        expect(routeSource).not.toContain("published_at, created_at")
        expect(routeSource).not.toContain("views, date, created_at")
    })

    it("loads saved analytics before any user-requested provider sync", () => {
        expect(pageSource).toContain("useSWR<AnalyticsResponse>")
        expect(pageSource).not.toContain("Auto-sync analytics on page load")
        expect(pageSource).not.toContain("initialSyncDone")
        expect(pageSource).not.toContain("hasSynced")
    })

    it("ranks content inside the selected reporting range", () => {
        expect(routeSource).toContain("const topPosts = [...currentPosts]")
        expect(routeSource).toContain("postsInRange: currentPosts.length")
        expect(routeSource).toContain("no_published_posts_in_range")
    })
})
