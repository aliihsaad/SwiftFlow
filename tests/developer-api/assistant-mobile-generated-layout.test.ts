import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const readProjectFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

describe("assistant generated result mobile layout", () => {
  it("keeps generated result wrappers full-width and overflow guarded on mobile", () => {
    const source = readProjectFile("app/dashboard/assistant/chat-interface.tsx")

    expect(source).toContain("w-full max-w-none overflow-hidden items-stretch")
    expect(source).toContain("mt-1 w-full min-w-0 max-w-full overflow-hidden")
    expect(source.match(/min-w-0 max-w-full overflow-hidden/g)?.length ?? 0).toBeGreaterThanOrEqual(6)
  })

  it("keeps structured assistant responses mobile-first without a JS mobile width dependency", () => {
    const source = readProjectFile("app/dashboard/assistant/components/command-center/assistant-response.tsx")

    expect(source).toContain("w-full max-w-none min-w-0 overflow-hidden")
    expect(source).toContain("sm:max-w-2xl")
    expect(source).not.toMatch(/(^|["'\s])max-w-2xl(\s|["'])/)
    expect(source).not.toContain("isMobile")
  })
})
