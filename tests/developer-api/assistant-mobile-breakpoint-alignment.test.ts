import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"
import { ASSISTANT_MOBILE_BREAKPOINT } from "@/lib/assistant/mobile-layout"

const assistantRoots = [
  "app/dashboard/assistant",
  "lib/assistant",
]

const collectSourceFiles = (dir: string): string[] => {
  const entries = readdirSync(dir)
  return entries.flatMap((entry) => {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) return collectSourceFiles(fullPath)
    if (!/\.(ts|tsx)$/.test(entry)) return []
    return [fullPath]
  })
}

describe("assistant mobile breakpoint alignment", () => {
  it("keeps assistant CSS desktop restores aligned with the 768px mobile hook", () => {
    expect(ASSISTANT_MOBILE_BREAKPOINT).toBe(768)

    const offenders = assistantRoots
      .flatMap((root) => collectSourceFiles(join(process.cwd(), root)))
      .filter((filePath) => readFileSync(filePath, "utf8").includes("sm:"))
      .map((filePath) => relative(process.cwd(), filePath))

    expect(offenders).toEqual([])
  })
})
