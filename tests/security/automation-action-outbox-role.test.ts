import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

const outboxMigration = readRepositoryFile(
  "supabase/migrations/20260727090000_add_automation_action_outbox.sql",
)
const executorMigration = readRepositoryFile(
  "supabase/migrations/20260727091000_add_automation_action_executor_role.sql",
)
const comparisonHandler = readRepositoryFile("lib/webhooks/comment-private-reply-comparison.ts")
const comparisonWorkerEntry = readRepositoryFile("workers/comment-comparison.ts")
const executorWorkerEntry = readRepositoryFile("workers/action-executor.ts")
const gates = readRepositoryFile("lib/automation/action-safety-gates.ts")

const IDENTITY_COLUMNS = [
  "provider",
  "provider_event_key",
  "automation_id",
  "workflow_version_id",
  "node_id",
  "action_type",
  "target_id",
]

describe("action outbox schema", () => {
  it("enforces the full idempotency identity with a unique constraint", () => {
    const constraint = outboxMigration.slice(
      outboxMigration.indexOf("automation_action_outbox_identity_unique"),
      outboxMigration.indexOf("constraint automation_action_outbox_status_check"),
    )
    for (const column of IDENTITY_COLUMNS) {
      expect(constraint).toContain(column)
    }
  })

  it("supports every required durable state", () => {
    for (const status of [
      "pending",
      "claimed",
      "succeeded",
      "retry_scheduled",
      "dead_lettered",
      "suppressed",
    ]) {
      expect(outboxMigration).toContain(`'${status}'`)
    }
  })

  it("claims transactionally and recovers expired leases", () => {
    expect(outboxMigration).toContain("for update skip locked")
    expect(outboxMigration).toContain("lock_expires_at <= now()")
    expect(outboxMigration).toContain("lease_expired_after_final_attempt")
    expect(outboxMigration).toContain("attempt_count = action.attempt_count + 1")
  })

  it("records attempts, retry time and redacted audit fields", () => {
    for (const column of [
      "attempt_count",
      "max_attempts",
      "available_at",
      "provider_response_id",
      "provider_response",
      "last_error_code",
      "last_error_message",
      "suppressed_reason",
      "first_attempted_at",
      "processed_at",
    ]) {
      expect(outboxMigration).toContain(column)
    }
  })
})

describe("role separation", () => {
  it("gives the comparison role append-only access and no credentials", () => {
    const grant = outboxMigration.slice(
      outboxMigration.indexOf("grant insert ("),
      outboxMigration.indexOf("to swiftflow_webhook_comparison;", outboxMigration.indexOf("grant insert (")),
    )
    for (const column of IDENTITY_COLUMNS) {
      expect(grant).toContain(column)
    }
    for (const forbidden of ["status", "attempt_count", "locked_by", "provider_response_id"]) {
      expect(grant).not.toContain(forbidden)
    }

    // The comparison role must never be handed select/update/delete on the outbox
    // and must never be granted the claim function.
    expect(outboxMigration).not.toMatch(/grant\s+select[^;]*swiftflow_webhook_comparison/i)
    expect(outboxMigration).not.toMatch(/grant\s+update[^;]*swiftflow_webhook_comparison/i)
    expect(outboxMigration).not.toMatch(/grant\s+execute[^;]*swiftflow_webhook_comparison/i)
    expect(outboxMigration).not.toContain("access_token")
  })

  it("makes the executor the only role that can read a provider token", () => {
    expect(executorMigration).toContain("create role swiftflow_action_executor nologin")
    expect(executorMigration).toContain("nobypassrls")
    expect(executorMigration).toContain("access_token")
    // It sends; it does not manage token lifecycle.
    expect(executorMigration).not.toContain("refresh_token")
    // It executes queued work; it cannot create work.
    expect(executorMigration).not.toMatch(/grant\s+insert/i)
    expect(executorMigration).not.toMatch(/grant\s+delete/i)
    expect(executorMigration).not.toMatch(/\bpassword\s+['"]/i)
  })
})

describe("side-effect separation", () => {
  it("keeps the comparison path free of any network call", () => {
    for (const forbidden of ["fetch(", "https://graph.", "axios", "sendMetaTextMessage"]) {
      expect(comparisonHandler).not.toContain(forbidden)
      expect(comparisonWorkerEntry).not.toContain(forbidden)
    }
    expect(comparisonHandler).toContain("sideEffectsExecuted: false")
  })

  it("only constructs the real adapter when provider actions are enabled", () => {
    // Gate A wires the real adapter, but behind resolveProviderActionAdapter,
    // so with the kill switch off nothing in the process can make a call.
    expect(executorWorkerEntry).toContain("createMetaPrivateReplyAdapter")
    expect(executorWorkerEntry).toContain("resolveProviderActionAdapter")
    expect(executorWorkerEntry).toMatch(
      /resolveProviderActionAdapter\(\s*\n?\s*config\.providerActionsEnabled/,
    )
    // It must never be constructed unconditionally.
    expect(executorWorkerEntry).not.toMatch(/adapter\s*=\s*createMetaPrivateReplyAdapter\(\)/)

    const adapterModule = readRepositoryFile("lib/automation/provider-action-adapter.ts")
    expect(adapterModule).toMatch(
      /providerActionsEnabled\s*\?\s*createRealAdapter\(\)\s*:\s*createDisabledProviderActionAdapter\(\)/,
    )
  })

  it("enforces a single executor instance with an advisory lock, not deploy.replicas", () => {
    expect(executorWorkerEntry).toContain("acquireSingleReplicaLock")
    const runtime = readRepositoryFile("lib/automation/action-executor-runtime.ts")
    expect(runtime).toContain("pg_try_advisory_lock")
    expect(runtime).toContain("refusing to start")
    // The lock must be released on shutdown so a restart is not wedged.
    expect(executorWorkerEntry).toContain("singleReplicaLock.release()")
  })

  it("keeps the kill switch off and the allowlist empty in the deployed compose", () => {
    const compose = readRepositoryFile("compose.webhook-comparison.staging.yaml")
    const executorService = compose.slice(compose.indexOf("  action-executor:"))
    expect(executorService).toMatch(/AUTOMATION_PROVIDER_ACTIONS_ENABLED:\s*"false"/)
    expect(executorService).toMatch(/AUTOMATION_PROVIDER_ACTIONS_ALLOWLIST:\s*""/)
    expect(executorService).toMatch(/AUTOMATION_RUNTIME_GUARDS_REQUIRED:\s*"true"/)
    // Staging remains intentionally conservative even though budgets are distributed.
    expect(executorService).not.toMatch(/replicas:\s*[2-9]/)
    expect(executorService).not.toMatch(/scale:\s*[2-9]/)
  })
})

describe("meta private reply adapter contract", () => {
  const adapter = readRepositoryFile("lib/automation/meta-private-reply-adapter.ts")

  it("uses the documented Instagram Login endpoint and Bearer authentication", () => {
    expect(adapter).toContain("https://graph.instagram.com")
    expect(adapter).toContain("/messages")
    expect(adapter).toContain("Bearer ${credentials.accessToken}")
    // The token must never travel as a query parameter.
    expect(adapter).not.toMatch(/access_token=/)
  })

  it("requires the comment permissions rather than the messaging ones", () => {
    expect(gates).toMatch(
      /action_private_reply:\s*\[\s*"instagram_business_basic",\s*"instagram_business_manage_comments"\s*\]/,
    )
  })

  it("bounds the request and the response", () => {
    expect(adapter).toContain("AbortController")
    expect(adapter).toContain("MAX_RESPONSE_BYTES")
    expect(adapter).toContain('redirect: "error"')
  })

  it("marks a dispatched-but-unknown outcome as ambiguous", () => {
    expect(adapter).toContain("ambiguous: dispatched")
    const retryPolicy = readRepositoryFile("lib/automation/action-retry-policy.ts")
    expect(retryPolicy).toContain('if (failure.ambiguous === true) return "terminal"')
  })

  it("documents that the local limiter is not the distributed budget authority", () => {
    expect(gates).toContain("LOCAL BURST GUARD")
    expect(gates).toContain("PostgreSQL runtime guard")
  })
})

describe("safety gates default to the safest state", () => {
  it("keeps the kill switch off and the allowlist empty unless configured", () => {
    expect(gates).toContain("AUTOMATION_PROVIDER_ACTIONS_ENABLED")
    expect(gates).toContain("provider_actions_disabled")
    expect(gates).toContain("allowlist_empty")
    expect(gates).toContain("account_not_allowlisted")
    expect(gates).toContain("automation_not_active")
    expect(gates).toContain("self_authored_event")
    expect(gates).toContain("missing_access_token")
    expect(gates).toContain("rate_limited")
  })

  it("evaluates the kill switch before touching credentials", () => {
    const evaluate = gates.slice(gates.indexOf("export function evaluateActionGates"))
    expect(evaluate.indexOf("checkKillSwitch"))
      .toBeLessThan(evaluate.indexOf("checkTokenAndPermissions"))
  })
})

describe("existing P0 node and condition guards remain in place", () => {
  it("still disables the unrestricted HTTP action everywhere it can be activated", () => {
    for (const file of [
      "app/api/automations/validate/route.ts",
      "lib/developer-api/automation-graph.ts",
      "supabase/functions/process-automations/graph-executor.ts",
    ]) {
      expect(readRepositoryFile(file)).toContain("action_http_request")
    }
    expect(readRepositoryFile("app/api/automations/validate/route.ts"))
      .toMatch(/TEMP_DISABLED_NODE_TYPES[\s\S]{0,120}action_http_request/)
    expect(readRepositoryFile("lib/developer-api/automation-graph.ts"))
      .toMatch(/TEMP_DISABLED_NODE_TYPES[\s\S]{0,120}action_http_request/)
  })

  it("still disables the placeholder count conditions", () => {
    const policy = readRepositoryFile("supabase/functions/_shared/automation-condition-policy.ts")
    expect(policy).toContain("follower_count")
    expect(policy).toContain("comment_count")
    expect(policy).toContain("CONDITION_TEMPORARILY_DISABLED")
  })
})
