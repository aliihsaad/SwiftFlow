import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

const dockerfile = readRepositoryFile("Dockerfile.webhook-comparison")
const dockerignore = readRepositoryFile(
  "Dockerfile.webhook-comparison.dockerignore",
)
const compose = readRepositoryFile("compose.webhook-comparison.yaml")
const roleMigration = readRepositoryFile(
  "supabase/migrations/20260726203000_add_webhook_comparison_worker_role.sql",
)

describe("webhook comparison deployment boundary", () => {
  it("runs the container as an unprivileged, read-only, restartable service", () => {
    expect(dockerfile).toContain("USER swiftflow")
    expect(dockerfile).toContain("node:24-alpine@sha256:")
    expect(dockerfile).toContain("comment-comparison-healthcheck.ts")
    expect(compose).toContain("restart: unless-stopped")
    expect(compose).toContain("read_only: true")
    expect(compose).toContain("no-new-privileges:true")
    expect(compose).toMatch(/cap_drop:\s*\r?\n\s+- ALL/)
    expect(compose).toContain('WEBHOOK_COMPARISON_RUN_ONCE: "false"')
    expect(compose).not.toMatch(/\bports:/)
  })

  it("keeps secrets and unrelated application sources out of the image context", () => {
    expect(dockerignore).toMatch(/^\*\*/m)
    expect(dockerignore).toContain("!lib/webhooks/")
    expect(dockerignore).toContain("!workers/")
    expect(dockerignore).not.toContain("!.env")
    expect(dockerignore).not.toContain("!app/")
  })

  it("defines a no-login, non-bypass capability role with narrow grants", () => {
    expect(roleMigration).toContain(
      "create role swiftflow_webhook_comparison nologin",
    )
    expect(roleMigration).toContain("nobypassrls")
    expect(roleMigration).toContain("grant update (")
    expect(roleMigration).toContain("grant select (")
    expect(roleMigration).toContain("account_id")
    expect(roleMigration).toContain("workflow_graph")
    expect(roleMigration).not.toMatch(
      /grant\s+select\s+on\s+table\s+public\.social_accounts/i,
    )
    expect(roleMigration).toContain("grant execute")
    expect(roleMigration).not.toMatch(
      /grant\s+all[\s\S]*to\s+swiftflow_webhook_comparison/i,
    )
    expect(roleMigration).not.toMatch(
      /grant\s+(insert|delete|truncate)[\s\S]*to\s+swiftflow_webhook_comparison/i,
    )
  })
})
