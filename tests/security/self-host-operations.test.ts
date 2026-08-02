import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

const common = readRepositoryFile("scripts/self-host/common.sh")
const preflight = readRepositoryFile("scripts/self-host/preflight.sh")
const doctor = readRepositoryFile("scripts/self-host/doctor.sh")
const backup = readRepositoryFile("scripts/self-host/backup.sh")
const restore = readRepositoryFile("scripts/self-host/restore-rehearsal.sh")
const upgrade = readRepositoryFile("scripts/self-host/upgrade.sh")
const inventory = readRepositoryFile("scripts/postgres/self-host-inventory.sql")
const health = readRepositoryFile("scripts/postgres/self-host-health.sql")
const documentation = readRepositoryFile(
  "docs/transformation/self-host-operations-foundation.md",
)

describe("self-host operations safety contract", () => {
  it("scopes every Docker operation to a SwiftFlow Compose project", () => {
    expect(common).toContain("swiftflow_validate_project_name")
    expect(common).toContain("'^swiftflow-[a-z0-9_-]+$'")
    expect(common).toContain('-p "$SWIFTFLOW_COMPOSE_PROJECT"')
    expect(doctor).toContain('swiftflow_compose ps -q "$required_service"')
    expect(doctor).not.toMatch(/\bdocker ps\b/)
  })

  it("fails preflight on weak environment-file state without sourcing secrets", () => {
    expect(preflight).toContain("400|600")
    expect(common).toContain("must not be a symbolic link")
    expect(preflight).toContain("must be owned by the current operator")
    expect(preflight).toContain("missing, empty, or duplicated")
    expect(preflight).toContain("placeholder value remains")
    expect(preflight).not.toMatch(/^\s*\.\s+["']?\$SWIFTFLOW_ENV_FILE/m)
    expect(preflight).not.toMatch(/\b(?:cat|echo)\b[^\n]*SWIFTFLOW_ENV_FILE/)
  })

  it("requires all four healthy scoped services and the current schema", () => {
    for (const service of [
      "postgres",
      "webhook-comparison",
      "webhook-ingress",
      "action-executor",
    ]) {
      expect(doctor).toContain(service)
    }
    expect(doctor).toContain("running|healthy")
    expect(doctor).toContain("/opt/swiftflow/self-host-health.sql")
    expect(health).toContain("required SwiftFlow schema objects are missing")
    expect(health).not.toMatch(/access_token|refresh_token|app_secret/i)
  })

  it("creates an atomic checksummed backup without copying secrets", () => {
    expect(backup).toContain("umask 077")
    expect(backup).toContain("pg_dump")
    expect(backup).toContain("--format=custom")
    expect(backup).toContain("--no-owner")
    expect(backup).toContain("--no-privileges")
    expect(backup).toContain("self-host-inventory.sql")
    expect(backup).toContain("sha256sum database.dump inventory.json manifest.txt")
    expect(backup).toContain('mv -- "$working_directory" "$final_directory"')
    expect(backup).not.toMatch(/cp[^\n]*(?:SWIFTFLOW_ENV_FILE|\.env)/)
    expect(backup).not.toMatch(/access_token|refresh_token|app_secret/i)
    expect(inventory).not.toMatch(/access_token|refresh_token|app_secret/i)
  })

  it("restores only into a new prefixed rehearsal database", () => {
    expect(restore).toContain("swiftflow_restore_*")
    expect(restore).toContain("must never target the live database")
    expect(restore).toContain("already exists; it will not be overwritten")
    expect(restore).toContain("sha256sum --check SHA256SUMS")
    expect(restore).toContain("pg_restore")
    expect(restore).toContain("--exit-on-error")
    expect(restore).toContain('cmp -s "$backup_directory/inventory.json"')
    expect(restore).not.toContain("dropdb")
    expect(restore).not.toContain("drop database")
  })

  it("backs up before upgrade and never performs an automatic restore", () => {
    expect(upgrade.indexOf("backup.sh")).toBeLessThan(
      upgrade.indexOf("deploy-webhook-comparison-staging.sh"),
    )
    expect(upgrade).toContain("No automatic database restore was attempted")
    expect(upgrade).toContain("doctor.sh")
    expect(upgrade).not.toContain("restore-rehearsal.sh")
  })

  it("documents the staging-only boundary and destructive-operation gate", () => {
    expect(documentation).toMatch(
      /does \*\*not\*\* claim that the complete web\s+application is Supabase-free/,
    )
    expect(documentation).toMatch(
      /Promotion or destructive replacement of the live database is intentionally not\s+automated/,
    )
    expect(documentation).toContain(
      "extend these contracts to the future full application Compose stack",
    )
  })
})
