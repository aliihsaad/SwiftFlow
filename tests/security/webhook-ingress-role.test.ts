import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  composePortMappings,
  composeServiceBlock,
  isLoopbackMapping,
} from "./helpers/compose-ports"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8").replaceAll(
    "\r\n",
    "\n",
  )
}

const migration = readRepositoryFile(
  "supabase/migrations/20260726213000_add_webhook_ingress_role.sql",
)
const verifier = readRepositoryFile(
  "scripts/postgres/verify-webhook-ingress-role.sql",
)
const compose = readRepositoryFile("compose.webhook-comparison.staging.yaml")
const deploymentScript = readRepositoryFile(
  "scripts/deploy-webhook-comparison-staging.sh",
)
const ingressLogin = readRepositoryFile(
  "scripts/postgres/staging/310-ingress-login.sh",
)

const GRANTABLE_COLUMNS = [
  "provider",
  "provider_event_key",
  "provider_object",
  "event_type",
  "account_external_id",
  "delivery_hash",
  "payload",
]

const LIFECYCLE_COLUMNS = [
  "status",
  "attempt_count",
  "max_attempts",
  "available_at",
  "locked_at",
  "lock_expires_at",
  "locked_by",
  "last_error_code",
  "last_error_message",
  "processed_at",
  "result",
  "workspace_id",
  "social_account_id",
]

describe("webhook ingress capability role", () => {
  it("is a NOLOGIN role that cannot escalate or bypass RLS", () => {
    expect(migration).toContain("create role swiftflow_webhook_ingress nologin")
    for (const attribute of [
      "nologin",
      "nosuperuser",
      "nocreatedb",
      "nocreaterole",
      "noreplication",
      "nobypassrls",
    ]) {
      expect(migration).toContain(attribute)
    }
    expect(migration).toContain("revoke all on schema public from swiftflow_webhook_ingress")
    expect(migration).toContain("grant usage on schema public to swiftflow_webhook_ingress")
  })

  it("grants insert only on the columns the ingress actually writes", () => {
    const grantBlock = migration.slice(
      migration.indexOf("grant insert ("),
      migration.indexOf("to swiftflow_webhook_ingress;", migration.indexOf("grant insert (")),
    )

    for (const column of GRANTABLE_COLUMNS) {
      expect(grantBlock).toContain(column)
    }
    for (const column of LIFECYCLE_COLUMNS) {
      expect(grantBlock).not.toContain(column)
    }
  })

  it("grants no read, update, delete, or claim capability", () => {
    expect(migration).not.toMatch(/grant\s+select/i)
    expect(migration).not.toMatch(/grant\s+update/i)
    expect(migration).not.toMatch(/grant\s+delete/i)
    expect(migration).not.toMatch(/grant\s+all/i)
    expect(migration).not.toMatch(/grant\s+execute/i)
    expect(migration).toContain(
      "revoke all privileges\n  on function public.claim_webhook_inbox_events(text, integer, integer)\n  from swiftflow_webhook_ingress;",
    )
  })

  it("revokes every privilege on account, automation, and workspace tables", () => {
    for (const table of [
      "public.social_accounts",
      "public.automations",
      "public.workspaces",
    ]) {
      expect(migration).toContain(
        `revoke all privileges\n  on table ${table}\n  from swiftflow_webhook_ingress;`,
      )
    }
  })

  it("pins new rows to the unclaimed initial state with an RLS insert policy", () => {
    expect(migration).toContain("create policy webhook_ingress_insert")
    expect(migration).toContain("for insert")
    expect(migration).toContain("to swiftflow_webhook_ingress")
    expect(migration).toContain("status = 'pending'")
    expect(migration).toContain("attempt_count = 0")
    expect(migration).toContain("workspace_id is null")
    expect(migration).toContain("social_account_id is null")
    expect(migration).toContain("locked_by is null")
    expect(migration).toContain("processed_at is null")
    // An update or select policy would defeat the append-only boundary.
    expect(migration).not.toMatch(/for\s+(select|update|delete|all)\b/i)
  })

  it("contains no credential material", () => {
    // Deployment logins are created outside migrations; a password literal here
    // would end up in version control.
    expect(migration).not.toMatch(/\bpassword\s+['"]/i)
    expect(migration).not.toMatch(/\bcreate\s+role\s+\w+\s+login\b/i)
    expect(migration).toContain("nologin")
  })
})

describe("webhook ingress role verifier", () => {
  it("fails closed on read, mutate, and claim privileges", () => {
    for (const assertion of [
      "has forbidden inbox privileges",
      "can read or mutate stored inbox rows",
      "can claim inbox work",
      "can read social accounts",
      "can read automation definitions",
      "can read workspaces unexpectedly",
      "can insert forbidden inbox column",
      "has a forbidden PostgreSQL capability",
    ]) {
      expect(verifier).toContain(assertion)
    }
  })

  it("requires every column the ingress must write", () => {
    for (const column of GRANTABLE_COLUMNS) {
      expect(verifier).toContain(`'${column}'`)
    }
  })
})

describe("staging ingress deployment", () => {
  it("runs under its own login with its own generated secret", () => {
    expect(ingressLogin).toContain("swiftflow_webhook_ingress_staging")
    expect(ingressLogin).toContain("grant swiftflow_webhook_ingress to swiftflow_webhook_ingress_staging")
    expect(ingressLogin).toContain("nobypassrls")
    expect(compose).toContain("WEBHOOK_INGRESS_DB_PASSWORD:?")
    expect(compose).toContain(
      "postgresql://swiftflow_webhook_ingress_staging:${WEBHOOK_INGRESS_DB_PASSWORD}@postgres:5432/swiftflow_staging",
    )
    expect(compose).not.toContain(
      "postgresql://swiftflow_webhook_worker_staging:${WEBHOOK_INGRESS_DB_PASSWORD}",
    )
    expect(deploymentScript).toContain(
      "ensure_generated_secret WEBHOOK_INGRESS_DB_PASSWORD",
    )
  })

  it("adds newly required variables to an existing environment file", () => {
    // A deployment predating this slice already has an environment file, so
    // creating secrets only when the file is absent would leave it incomplete.
    expect(deploymentScript).toContain('if [ ! -f "$environment_file" ]; then\n  : > "$environment_file"')
    expect(deploymentScript).toContain('grep -q "^$1=" "$environment_file"')
    expect(deploymentScript).toContain('chmod 600 "$environment_file"')

    for (const variable of [
      "SWIFTFLOW_STAGING_POSTGRES_ADMIN_PASSWORD",
      "WEBHOOK_COMPARISON_DB_PASSWORD",
      "WEBHOOK_INGRESS_DB_PASSWORD",
      "META_APP_SECRET",
      "META_WEBHOOK_VERIFY_TOKEN",
    ]) {
      expect(deploymentScript).toContain(`ensure_generated_secret ${variable}`)
    }

    // Only names are echoed, never values.
    expect(deploymentScript).toContain("printf 'Generated missing %s\\n' \"$1\" >&2")
    expect(deploymentScript).not.toMatch(/echo[^\n]*\$(?:generated_secret|admin_password|ingress_password)/)
  })

  it("applies the role migrations to an already initialized database", () => {
    // initdb scripts run only on an empty data directory, so an existing
    // staging database would otherwise never gain the ingress role.
    expect(deploymentScript).toContain("up -d --wait postgres")
    expect(deploymentScript).toContain(
      "/docker-entrypoint-initdb.d/210-webhook-ingress-role.sql",
    )
    expect(deploymentScript).toContain(
      "/docker-entrypoint-initdb.d/310-ingress-login.sh",
    )
    expect(deploymentScript).toContain("-v ON_ERROR_STOP=1")

    // The base schema and smoke seed are not idempotent and must not be replayed.
    expect(deploymentScript).not.toContain("000-base-schema.sql")
    expect(deploymentScript).not.toContain("400-smoke-seed.sql")

    // The database must be reachable before the ingress healthcheck runs.
    expect(deploymentScript.indexOf("up -d --wait postgres"))
      .toBeLessThan(deploymentScript.indexOf("210-webhook-ingress-role.sql"))
    expect(deploymentScript.indexOf("310-ingress-login.sh"))
      .toBeLessThan(deploymentScript.indexOf("up -d --build --wait"))
  })

  it("publishes no host port for any service", () => {
    // Nothing in this stack is reachable from a host interface. The reverse
    // proxy reaches the ingress over the internal bridge at a pinned address,
    // so no binding is needed and none is permitted.
    expect(composePortMappings(compose)).toHaveLength(0)
    expect(compose).not.toMatch(/^\s*ports:/m)

    for (const service of ["postgres", "webhook-comparison", "webhook-ingress"]) {
      expect(composeServiceBlock(compose, service)).not.toMatch(/ports:/)
    }

    // Defence in depth: if a binding is ever added it must be loopback-only.
    expect(composePortMappings(compose).every(isLoopbackMapping)).toBe(true)
    expect(compose).not.toMatch(/^\s*-\s*["']?0\.0\.0\.0:/m)
    expect(compose).not.toMatch(/^\s*-\s*["']?\[::\]:/m)
  })

  it("pins the ingress address so the proxy has a stable target", () => {
    expect(composeServiceBlock(compose, "webhook-ingress"))
      .toMatch(/ipv4_address:\s*172\.22\.0\.10/)
    // A static address requires user-configured IPAM, and the network must
    // stay internal so the pinned address is unreachable from outside the host.
    expect(compose).toMatch(/subnet:\s*172\.22\.0\.0\/16/)
    expect(compose).toContain("internal: true")
  })

  it("stays hardened and on an internal network", () => {
    expect(compose).toContain("internal: true")

    const ingressService = compose.slice(compose.indexOf("  webhook-ingress:"))
    expect(ingressService).toContain("read_only: true")
    expect(ingressService).toContain("no-new-privileges:true")
    expect(ingressService).toContain("cap_drop")
    expect(ingressService).toContain("pids_limit: 100")
    expect(ingressService).toContain("command: [\"workers/webhook-ingress.ts\"]")
    expect(ingressService).toContain("workers/webhook-ingress-healthcheck.ts")
  })

  it("requires explicit Meta ingress secrets", () => {
    expect(compose).toContain("META_APP_SECRET:?")
    expect(compose).toContain("META_WEBHOOK_VERIFY_TOKEN:?")
    expect(deploymentScript).toContain("openssl rand -hex 32")
    expect(deploymentScript).not.toMatch(
      /(?:password|secret|token)=['"][^$][^'"]{8,}['"]/i,
    )
  })

  it("verifies the append-only role and a synthetic signed delivery", () => {
    expect(deploymentScript).toContain("verify-webhook-ingress-role.sql")
    expect(deploymentScript).toContain("workers/webhook-ingress-smoke.ts")
    expect(deploymentScript).toContain("verify-ingress-result.sql")
    expect(deploymentScript).toContain("swiftflow_webhook_ingress_staging")
  })

  it("does not enable live shadow capture from the application route", () => {
    expect(compose).not.toContain("WEBHOOK_INBOX_SHADOW_ENABLED")
    expect(deploymentScript).not.toContain("WEBHOOK_INBOX_SHADOW_ENABLED")
  })
})
