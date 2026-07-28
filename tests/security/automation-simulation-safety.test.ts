import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

const simulation = readFileSync(
  resolve(process.cwd(), "lib/automation/automation-simulation.ts"),
  "utf8",
)
const cli = readFileSync(
  resolve(process.cwd(), "workers/automation-simulation.ts"),
  "utf8",
)

describe("automation simulation safety boundary", () => {
  it("uses the recording adapter and never imports the live Meta adapter", () => {
    expect(simulation).toContain("createRecordingProviderActionAdapter")
    expect(simulation).not.toContain("createMetaPrivateReplyAdapter")
    expect(simulation).not.toContain("meta-private-reply-adapter")
  })

  it("contains no network primitive or provider endpoint", () => {
    expect(simulation).not.toMatch(/\bfetch\s*\(/)
    expect(simulation).not.toContain("graph.instagram.com")
    expect(cli).not.toMatch(/\bfetch\s*\(/)
    expect(cli).not.toContain("graph.instagram.com")
  })

  it("reports zero network calls and recording-only capability", () => {
    expect(simulation).toContain('providerCapability: "recording_only"')
    expect(simulation).toContain("networkCalls: 0")
  })
})
