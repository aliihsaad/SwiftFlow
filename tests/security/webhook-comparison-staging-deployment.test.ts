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

const compose = readRepositoryFile("compose.webhook-comparison.staging.yaml")
const bootstrap = readRepositoryFile(
  "scripts/postgres/staging/000-base-schema.sql",
)
const smokeSeed = readRepositoryFile(
  "scripts/postgres/staging/400-smoke-seed.sql",
)
const smokeVerifier = readRepositoryFile(
  "scripts/postgres/staging/verify-smoke-result.sql",
)
const ingressVerifier = readRepositoryFile(
  "scripts/postgres/staging/verify-ingress-result.sql",
)
const ingressSmoke = readRepositoryFile("workers/webhook-ingress-smoke.ts")
const testerSeed = readRepositoryFile(
  "scripts/postgres/staging/seed-tester-account.sh",
)
const deploymentScript = readRepositoryFile(
  "scripts/deploy-webhook-comparison-staging.sh",
)
const stagingEnvironmentExample = readRepositoryFile(
  "env.webhook-comparison.staging.example",
)

describe("isolated webhook comparison staging stack", () => {
  it("keeps PostgreSQL private and pins the database image", () => {
    expect(compose).toContain("postgres:15-alpine@sha256:")
    expect(compose).toContain("internal: true")
    expect(compose).toContain("webhook-comparison-postgres:")

    // The database must never gain a host binding, and no service may publish
    // on a routable address. The ingress loopback binding is the sole exception.
    expect(composeServiceBlock(compose, "postgres")).not.toMatch(/ports:/)
    expect(composePortMappings(compose).every(isLoopbackMapping)).toBe(true)
  })

  it("gives outbound access only to the provider action executor", () => {
    const executor = composeServiceBlock(compose, "action-executor")

    expect(executor).toContain("provider-egress:")
    expect(executor).toContain("gw_priority: 1")
    expect(executor).not.toMatch(/ports:/)

    for (const service of ["postgres", "webhook-comparison", "webhook-ingress"]) {
      expect(composeServiceBlock(compose, service)).not.toContain("provider-egress")
    }

    expect(compose).toMatch(
      /provider-egress:\s*\r?\n\s+driver: bridge/,
    )
  })

  it("requires independent admin and worker secrets", () => {
    expect(compose).toContain(
      "SWIFTFLOW_STAGING_POSTGRES_ADMIN_PASSWORD:?",
    )
    expect(compose).toContain("WEBHOOK_COMPARISON_DB_PASSWORD:?")
    expect(deploymentScript).toContain("openssl rand -hex 32")
    expect(deploymentScript).toContain('chmod 600 "$environment_file"')
    expect(deploymentScript).not.toMatch(
      /(?:password|secret)=['"][^$][^'"]{8,}['"]/i,
    )
  })

  it("passes the Instagram app secret to the ingress", () => {
    expect(compose).toContain(
      "INSTAGRAM_APP_SECRET: ${INSTAGRAM_APP_SECRET:?",
    )
    expect(stagingEnvironmentExample).toContain("INSTAGRAM_APP_SECRET=")
    expect(deploymentScript).toContain(
      "ensure_generated_secret INSTAGRAM_APP_SECRET",
    )
  })

  it("proves token denial and a synthetic zero-side-effect match", () => {
    expect(bootstrap).toContain("access_token text")
    expect(bootstrap).toContain("refresh_token text")
    expect(smokeSeed).toContain("staging-token-must-not-be-readable")
    expect(smokeVerifier).toContain("sideEffectsExecuted")
    expect(smokeVerifier).toContain("matchedAutomationIds")
    expect(deploymentScript).toContain(
      "verify-webhook-comparison-role.sql",
    )
    expect(deploymentScript).toContain("verify-smoke-result.sql")
  })

  it("models a complete Instagram comment in the signed ingress smoke", () => {
    expect(ingressSmoke).toContain('const SMOKE_ENTRY_ID = "17841400000000000"')
    expect(ingressSmoke).toContain('text: "Please send the SwiftFlow details"')
    expect(ingressSmoke).toContain("self_ig_scoped_id:")
    expect(ingressSmoke).toContain('media_product_type: "FEED"')
    expect(ingressSmoke).toContain("parent_id:")
    expect(ingressVerifier).toContain("sideEffectsExecuted")
    expect(ingressVerifier).toContain("matchedAutomationIds")
    expect(deploymentScript).toContain(
      "Signed ingress smoke did not reach the verified state.",
    )
    expect(deploymentScript).toContain("exec -T \\\n  webhook-ingress")
    expect(deploymentScript).toContain("node_modules/tsx/dist/cli.mjs")
    expect(deploymentScript).not.toContain("run --rm --no-deps")
  })

  it("preserves both Instagram Login and webhook account identifiers", () => {
    expect(testerSeed).toContain('webhook_account_id="${1:')
    expect(testerSeed).toContain('instagram_login_user_id="${3:-$webhook_account_id}"')
    expect(testerSeed).toContain("'webhook_account_id', :'webhook_account_id'")
    expect(testerSeed).toContain("'ig_user_id', :'ig_user_id'")
  })

  it("does not enable live shadow capture or contain a deployment host", () => {
    expect(compose).not.toContain("WEBHOOK_INBOX_SHADOW_ENABLED")
    expect(deploymentScript).not.toContain("WEBHOOK_INBOX_SHADOW_ENABLED")
    expect(deploymentScript.replaceAll("127.0.0.1", "")).not.toMatch(
      /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
    )
  })
})
