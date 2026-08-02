import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const loginPage = readFileSync(path.join(root, "app", "login", "page.tsx"), "utf8")
const dashboardLayout = readFileSync(
  path.join(root, "app", "dashboard", "layout.tsx"),
  "utf8",
)
const signInRoute = readFileSync(
  path.join(root, "app", "api", "auth", "sign-in", "route.ts"),
  "utf8",
)

describe("authenticated navigation", () => {
  it("uses a full document transition after a session is created", () => {
    expect(loginPage.match(/window\.location\.replace\(nextPath\)/g)).toHaveLength(2)
    expect(loginPage).not.toContain("router.push(nextPath)")
    expect(loginPage).not.toContain("useRouter")
  })

  it("returns the exact response that received the Supabase session cookies", () => {
    expect(signInRoute).toContain(
      "const response = NextResponse.json({ ok: true }, { status: 200 })",
    )
    expect(signInRoute).toMatch(
      /signInWithPassword\(\{ email, password \}\)[\s\S]*return response/,
    )
    expect(signInRoute).not.toContain(
      "NextResponse.json({ ok: true }, { headers: response.headers })",
    )
  })

  it("redirects unauthenticated dashboard requests instead of rendering blank", () => {
    expect(dashboardLayout).toContain('import { redirect } from "next/navigation"')
    expect(dashboardLayout).toContain('if (!user) redirect("/login")')
    expect(dashboardLayout).not.toContain("if (!user) return null")
  })
})
