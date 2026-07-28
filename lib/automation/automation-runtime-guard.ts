import type { PostgresQueryClient } from "../webhooks/postgres-inbox-repository"

export type AutomationRuntimeResource = "provider_send" | "ai_generation"

export interface AutomationRuntimeGuardScope {
  workspaceId: string
  socialAccountId: string
  automationId: string
  resourceKind: AutomationRuntimeResource
}

export interface AutomationRuntimeGuardPolicy {
  accountLimit: number
  automationLimit: number
  windowSeconds: number
  failureThreshold: number
  cooldownSeconds: number
}

export interface AutomationRuntimeGuardDecision {
  allowed: boolean
  reason: string
  retryAfterSeconds: number
  accountRemaining: number
  automationRemaining: number
}

export interface AutomationRuntimeGuard {
  reserve(
    scope: AutomationRuntimeGuardScope,
    policy: AutomationRuntimeGuardPolicy,
  ): Promise<AutomationRuntimeGuardDecision>
  recordOutcome(
    scope: AutomationRuntimeGuardScope,
    policy: AutomationRuntimeGuardPolicy,
    outcome: { succeeded: boolean; failureCode?: string },
  ): Promise<void>
}

interface GuardReservationRow {
  allowed?: unknown
  reason?: unknown
  retry_after_seconds?: unknown
  account_remaining?: unknown
  automation_remaining?: unknown
}

export const RESERVE_AUTOMATION_RUNTIME_BUDGET_SQL = `
  select * from public.reserve_automation_runtime_budget(
    $1::uuid,
    $2::uuid,
    $3::uuid,
    $4,
    $5,
    $6,
    $7,
    $8
  )
`

export const RECORD_AUTOMATION_RUNTIME_OUTCOME_SQL = `
  select public.record_automation_runtime_outcome(
    $1::uuid,
    $2::uuid,
    $3::uuid,
    $4,
    $5,
    $6,
    $7,
    $8
  )
`

function boundedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(Math.max(Math.trunc(value), minimum), maximum)
}

function requiredId(value: string, label: string): string {
  const id = value.trim()
  if (!id) throw new Error(`${label} is required for the automation runtime guard`)
  return id
}

function safeFailureCode(value: string | undefined): string {
  return (value || "provider_error").replace(/\s+/g, "_").slice(0, 120)
}

export class PostgresAutomationRuntimeGuard implements AutomationRuntimeGuard {
  constructor(private readonly database: PostgresQueryClient) {}

  async reserve(
    scope: AutomationRuntimeGuardScope,
    policy: AutomationRuntimeGuardPolicy,
  ): Promise<AutomationRuntimeGuardDecision> {
    const result = await this.database.query(RESERVE_AUTOMATION_RUNTIME_BUDGET_SQL, [
      requiredId(scope.workspaceId, "workspaceId"),
      requiredId(scope.socialAccountId, "socialAccountId"),
      requiredId(scope.automationId, "automationId"),
      scope.resourceKind,
      boundedInteger(policy.accountLimit, 1, 100_000),
      boundedInteger(policy.automationLimit, 1, 100_000),
      boundedInteger(policy.windowSeconds, 1, 86_400),
      boundedInteger(policy.cooldownSeconds, 1, 86_400),
    ])
    const row = result.rows[0] as GuardReservationRow | undefined
    if (!row) {
      return {
        allowed: false,
        reason: "runtime_guard_unavailable",
        retryAfterSeconds: 30,
        accountRemaining: 0,
        automationRemaining: 0,
      }
    }
    return {
      allowed: row.allowed === true,
      reason: String(row.reason || (row.allowed === true ? "allowed" : "runtime_guard_denied")),
      retryAfterSeconds: Math.max(Number(row.retry_after_seconds) || 0, 0),
      accountRemaining: Math.max(Number(row.account_remaining) || 0, 0),
      automationRemaining: Math.max(Number(row.automation_remaining) || 0, 0),
    }
  }

  async recordOutcome(
    scope: AutomationRuntimeGuardScope,
    policy: AutomationRuntimeGuardPolicy,
    outcome: { succeeded: boolean; failureCode?: string },
  ): Promise<void> {
    await this.database.query(RECORD_AUTOMATION_RUNTIME_OUTCOME_SQL, [
      requiredId(scope.workspaceId, "workspaceId"),
      requiredId(scope.socialAccountId, "socialAccountId"),
      requiredId(scope.automationId, "automationId"),
      scope.resourceKind,
      outcome.succeeded === true,
      safeFailureCode(outcome.failureCode),
      boundedInteger(policy.failureThreshold, 1, 100),
      boundedInteger(policy.cooldownSeconds, 1, 86_400),
    ])
  }
}
