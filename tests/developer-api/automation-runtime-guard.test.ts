import { describe, expect, it } from "vitest"

import {
  PostgresAutomationRuntimeGuard,
  RECORD_AUTOMATION_RUNTIME_OUTCOME_SQL,
  RESERVE_AUTOMATION_RUNTIME_BUDGET_SQL,
  type AutomationRuntimeGuardPolicy,
  type AutomationRuntimeGuardScope,
} from "@/lib/automation/automation-runtime-guard"

const scope: AutomationRuntimeGuardScope = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  socialAccountId: "22222222-2222-4222-8222-222222222222",
  automationId: "33333333-3333-4333-8333-333333333333",
  resourceKind: "provider_send",
}

const policy: AutomationRuntimeGuardPolicy = {
  accountLimit: 60,
  automationLimit: 20,
  windowSeconds: 3_600,
  failureThreshold: 5,
  cooldownSeconds: 300,
}

describe("Postgres automation runtime guard", () => {
  it("maps an allowed durable reservation without exposing identifiers", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = []
    const guard = new PostgresAutomationRuntimeGuard({
      async query(sql, values) {
        calls.push({ sql, values })
        return {
          rowCount: 1,
          rows: [{
            allowed: true,
            reason: "allowed",
            retry_after_seconds: 0,
            account_remaining: 59,
            automation_remaining: 19,
          }],
        }
      },
    })

    await expect(guard.reserve(scope, policy)).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      retryAfterSeconds: 0,
      accountRemaining: 59,
      automationRemaining: 19,
    })
    expect(calls[0]?.sql).toBe(RESERVE_AUTOMATION_RUNTIME_BUDGET_SQL)
    expect(calls[0]?.values).toEqual([
      scope.workspaceId,
      scope.socialAccountId,
      scope.automationId,
      "provider_send",
      60,
      20,
      3_600,
      300,
    ])
  })

  it("fails closed when the reservation function returns no row", async () => {
    const guard = new PostgresAutomationRuntimeGuard({
      async query() {
        return { rowCount: 0, rows: [] }
      },
    })

    await expect(guard.reserve(scope, policy)).resolves.toMatchObject({
      allowed: false,
      reason: "runtime_guard_unavailable",
      accountRemaining: 0,
      automationRemaining: 0,
    })
  })

  it("records a bounded outcome through the dedicated function", async () => {
    const calls: Array<{ sql: string; values: unknown[] | undefined }> = []
    const guard = new PostgresAutomationRuntimeGuard({
      async query(sql, values) {
        calls.push({ sql, values })
        return { rowCount: 1, rows: [{}] }
      },
    })

    await guard.recordOutcome(scope, policy, {
      succeeded: false,
      failureCode: "rate limited by provider",
    })

    expect(calls[0]?.sql).toBe(RECORD_AUTOMATION_RUNTIME_OUTCOME_SQL)
    expect(calls[0]?.values).toEqual([
      scope.workspaceId,
      scope.socialAccountId,
      scope.automationId,
      "provider_send",
      false,
      "rate_limited_by_provider",
      5,
      300,
    ])
  })
})
