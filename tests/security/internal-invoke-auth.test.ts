import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Guards the internal edge-function invocation contract.
 *
 * Production incident 2026-07-03: the app server's service credential is a
 * legacy service_role JWT while the edge runtime is injected with a newer
 * key, so plain string-equality checks rejected every Vercel → edge internal
 * call with 401. internal-auth.ts now validates non-matching credentials
 * against the Auth admin API, and became async — every call site must await
 * it or the returned Promise is always truthy and the guard silently breaks.
 */

const root = process.cwd()
const functionsDir = path.join(root, "supabase", "functions")

function functionSources(): Array<{ name: string; source: string }> {
  return readdirSync(functionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .flatMap((entry) => {
      const indexPath = path.join(functionsDir, entry.name, "index.ts")
      try {
        return [{ name: entry.name, source: readFileSync(indexPath, "utf8") }]
      } catch {
        return []
      }
    })
}

describe("internal edge invocation auth", () => {
  it("internal-auth validates non-matching credentials against the Auth admin API", () => {
    const source = readFileSync(path.join(functionsDir, "_shared", "internal-auth.ts"), "utf8")
    expect(source).toContain("/auth/v1/admin/users")
    expect(source).toContain("export async function isAuthorizedInternalInvoke")
    expect(source).toContain("export async function assertInternalInvoke")
  })

  it("workspace-auth awaits the now-async internal invoke check", () => {
    const source = readFileSync(path.join(functionsDir, "_shared", "workspace-auth.ts"), "utf8")
    expect(source).toContain("await isAuthorizedInternalInvoke(req)")
  })

  it("every assertInternalInvoke call site awaits it", () => {
    const offenders: string[] = []
    for (const { name, source } of functionSources()) {
      for (const match of source.matchAll(/^.*assertInternalInvoke\s*\(/gm)) {
        const line = match[0]
        if (line.includes("import")) continue
        if (!line.includes("await assertInternalInvoke")) {
          offenders.push(`${name}: ${line.trim()}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("no function keeps a local string-equality copy of the internal guard", () => {
    const offenders = functionSources()
      .filter(({ source }) =>
        /function\s+(isAuthorizedInternalInvoke|isInternalRequest)\s*\(/.test(source),
      )
      .map(({ name }) => name)
    expect(offenders).toEqual([])
  })
})

describe("toast rendering", () => {
  it("root layout mounts the use-toast renderer so UI errors are visible", () => {
    const source = readFileSync(path.join(root, "app", "layout.tsx"), "utf8")
    expect(source).toContain('from "@/components/ui/toaster"')
    expect(source).toMatch(/<RadixToaster\s*\/>/)
  })
})
