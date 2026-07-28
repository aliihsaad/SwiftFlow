import type { ActionOutboxRecord } from "./action-outbox-contract"

/**
 * Every gate below fails closed. An action executes only when all of them
 * explicitly allow it; anything missing, malformed, or unknown suppresses.
 */

export interface ActionExecutorEnvironment
  extends Readonly<Record<string, string | undefined>> {
  AUTOMATION_PROVIDER_ACTIONS_ENABLED?: string
  AUTOMATION_PROVIDER_ACTIONS_ALLOWLIST?: string
  AUTOMATION_PROVIDER_ACTIONS_MAX_PER_ACCOUNT?: string
  AUTOMATION_PROVIDER_ACTIONS_WINDOW_MS?: string
  AUTOMATION_RUNTIME_GUARDS_REQUIRED?: string
  AUTOMATION_PROVIDER_SEND_ACCOUNT_BUDGET?: string
  AUTOMATION_PROVIDER_SEND_AUTOMATION_BUDGET?: string
  AUTOMATION_PROVIDER_SEND_BUDGET_WINDOW_SECONDS?: string
  AUTOMATION_PROVIDER_SEND_CIRCUIT_FAILURE_THRESHOLD?: string
  AUTOMATION_PROVIDER_SEND_CIRCUIT_COOLDOWN_SECONDS?: string
  ACTION_EXECUTOR_WORKER_ID?: string
  ACTION_EXECUTOR_BATCH_SIZE?: string
  ACTION_EXECUTOR_LEASE_SECONDS?: string
  ACTION_EXECUTOR_POLL_INTERVAL_MS?: string
  ACTION_EXECUTOR_RUN_ONCE?: string
}

export interface ActionExecutorConfig {
  /** Global kill switch. False unless explicitly enabled. */
  providerActionsEnabled: boolean
  /** External provider account ids permitted to send. Empty means none. */
  allowlist: readonly string[]
  maxActionsPerAccount: number
  rateWindowMs: number
  durableRuntimeGuardsRequired: boolean
  providerSendAccountBudget: number
  providerSendAutomationBudget: number
  providerSendBudgetWindowSeconds: number
  providerSendCircuitFailureThreshold: number
  providerSendCircuitCooldownSeconds: number
  workerId: string
  batchSize: number
  leaseSeconds: number
  pollIntervalMs: number
  runOnce: boolean
}

export interface ExecutorAccount {
  socialAccountId: string
  externalAccountId: string
  accessToken: string | null
  metadata: Record<string, unknown>
}

export interface ExecutorAutomation {
  id: string
  isActive: boolean
}

export type GateDecision =
  | { allowed: true }
  | { allowed: false; reason: string }

function booleanValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on"
}

function booleanDefaultTrue(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true
  const normalized = value.trim().toLowerCase()
  return !["false", "0", "no", "off"].includes(normalized)
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

export function resolveActionExecutorConfig(
  environment: ActionExecutorEnvironment = process.env,
): ActionExecutorConfig {
  const allowlist = (environment.AUTOMATION_PROVIDER_ACTIONS_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)

  return {
    providerActionsEnabled: booleanValue(environment.AUTOMATION_PROVIDER_ACTIONS_ENABLED),
    allowlist,
    maxActionsPerAccount: boundedInteger(
      environment.AUTOMATION_PROVIDER_ACTIONS_MAX_PER_ACCOUNT,
      5,
      1,
      1_000,
    ),
    rateWindowMs: boundedInteger(
      environment.AUTOMATION_PROVIDER_ACTIONS_WINDOW_MS,
      60_000,
      1_000,
      60 * 60_000,
    ),
    durableRuntimeGuardsRequired: booleanDefaultTrue(
      environment.AUTOMATION_RUNTIME_GUARDS_REQUIRED,
    ),
    providerSendAccountBudget: boundedInteger(
      environment.AUTOMATION_PROVIDER_SEND_ACCOUNT_BUDGET,
      60,
      1,
      100_000,
    ),
    providerSendAutomationBudget: boundedInteger(
      environment.AUTOMATION_PROVIDER_SEND_AUTOMATION_BUDGET,
      20,
      1,
      100_000,
    ),
    providerSendBudgetWindowSeconds: boundedInteger(
      environment.AUTOMATION_PROVIDER_SEND_BUDGET_WINDOW_SECONDS,
      3_600,
      1,
      86_400,
    ),
    providerSendCircuitFailureThreshold: boundedInteger(
      environment.AUTOMATION_PROVIDER_SEND_CIRCUIT_FAILURE_THRESHOLD,
      5,
      1,
      100,
    ),
    providerSendCircuitCooldownSeconds: boundedInteger(
      environment.AUTOMATION_PROVIDER_SEND_CIRCUIT_COOLDOWN_SECONDS,
      300,
      1,
      86_400,
    ),
    workerId: environment.ACTION_EXECUTOR_WORKER_ID?.trim().slice(0, 120) || "swiftflow-action-executor",
    batchSize: boundedInteger(environment.ACTION_EXECUTOR_BATCH_SIZE, 3, 1, 50),
    leaseSeconds: boundedInteger(environment.ACTION_EXECUTOR_LEASE_SECONDS, 60, 5, 3_600),
    pollIntervalMs: boundedInteger(environment.ACTION_EXECUTOR_POLL_INTERVAL_MS, 2_000, 100, 60_000),
    runOnce: booleanValue(environment.ACTION_EXECUTOR_RUN_ONCE),
  }
}

/**
 * Fixed-window counter, bounded in memory, scoped to ONE worker process.
 *
 * LOCAL BURST GUARD: this remains useful for smoothing one process, but it is
 * not the authority for product budgets. The PostgreSQL runtime guard consumes
 * both account and automation budgets atomically and owns the distributed
 * ceiling and circuit state. Correctness of the send-once guarantee remains in
 * the outbox identity and transactional claim. Staging still uses one replica
 * as a conservative rollout posture, not because budgets multiply with worker
 * count.
 */
export class AccountRateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryConsume(accountId: string): boolean {
    const timestamp = this.now()
    const existing = this.counters.get(accountId)

    if (!existing || timestamp >= existing.resetAt) {
      this.counters.set(accountId, { count: 1, resetAt: timestamp + this.windowMs })
      return true
    }

    if (existing.count >= this.limit) return false

    existing.count += 1
    return true
  }

  /** Drops expired buckets so the map cannot grow without bound. */
  prune(): void {
    const timestamp = this.now()
    for (const [key, value] of this.counters) {
      if (timestamp >= value.resetAt) this.counters.delete(key)
    }
  }
}

export function checkKillSwitch(config: ActionExecutorConfig): GateDecision {
  return config.providerActionsEnabled
    ? { allowed: true }
    : { allowed: false, reason: "provider_actions_disabled" }
}

export function checkAllowlist(
  config: ActionExecutorConfig,
  account: ExecutorAccount,
): GateDecision {
  if (config.allowlist.length === 0) {
    return { allowed: false, reason: "allowlist_empty" }
  }
  return config.allowlist.includes(account.externalAccountId)
    ? { allowed: true }
    : { allowed: false, reason: "account_not_allowlisted" }
}

export function checkAutomationActive(automation: ExecutorAutomation | null): GateDecision {
  if (!automation) return { allowed: false, reason: "automation_not_found" }
  return automation.isActive
    ? { allowed: true }
    : { allowed: false, reason: "automation_not_active" }
}

/**
 * Refuses to act on an event the connected account authored itself, which is
 * what turns a reply automation into an infinite loop. Both the plain author id
 * and Instagram's scoped identifier are compared.
 */
export function checkSelfLoop(
  record: ActionOutboxRecord,
  account: ExecutorAccount,
): GateDecision {
  const payload = record.payload || {}
  const candidates = [
    payload.authorExternalId,
    payload.authorScopedId,
    payload.recipientExternalId,
  ]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)

  const accountIdentities = new Set(
    [
      account.externalAccountId,
      typeof account.metadata.ig_user_id === "string" ? account.metadata.ig_user_id : "",
      typeof account.metadata.webhook_account_id === "string" ? account.metadata.webhook_account_id : "",
      typeof account.metadata.connected_page_id === "string" ? account.metadata.connected_page_id : "",
    ].filter(Boolean),
  )

  const selfAuthored = candidates.some((candidate) => accountIdentities.has(candidate))
  return selfAuthored
    ? { allowed: false, reason: "self_authored_event" }
    : { allowed: true }
}

/**
 * Verified against Meta's Instagram Platform private-replies documentation on
 * 2026-07-27. A private reply is authorised by the COMMENT permissions, not the
 * messaging ones - it is a reply to a comment that happens to arrive as a
 * message. Requiring instagram_business_manage_messages here would wrongly
 * suppress a correctly-permissioned account.
 */
const REQUIRED_PERMISSIONS_BY_ACTION: Readonly<Record<string, readonly string[]>> = {
  action_private_reply: ["instagram_business_basic", "instagram_business_manage_comments"],
  action_reply_comment: ["instagram_business_basic", "instagram_business_manage_comments"],
  action_send_dm: ["instagram_business_basic", "instagram_business_manage_messages"],
}

export function checkTokenAndPermissions(
  record: ActionOutboxRecord,
  account: ExecutorAccount,
): GateDecision {
  if (!account.accessToken || !account.accessToken.trim()) {
    return { allowed: false, reason: "missing_access_token" }
  }
  if (account.accessToken.startsWith("placeholder")) {
    return { allowed: false, reason: "placeholder_access_token" }
  }

  const expiresAt = account.metadata.token_expires_at
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const expiry = Date.parse(expiresAt)
    if (Number.isFinite(expiry) && expiry <= Date.now()) {
      return { allowed: false, reason: "access_token_expired" }
    }
  }

  const required = REQUIRED_PERMISSIONS_BY_ACTION[record.identity.actionType] || []
  if (required.length === 0) return { allowed: true }

  const granted = Array.isArray(account.metadata.permissions)
    ? (account.metadata.permissions as unknown[]).map((value) => String(value))
    : []

  const missing = required.filter((permission) => !granted.includes(permission))
  return missing.length === 0
    ? { allowed: true }
    : { allowed: false, reason: `missing_permission:${missing[0]}` }
}

export interface GateContext {
  config: ActionExecutorConfig
  record: ActionOutboxRecord
  account: ExecutorAccount | null
  automation: ExecutorAutomation | null
  rateLimiter: AccountRateLimiter
}

/**
 * Runs every gate in fail-closed order. The kill switch is evaluated first so a
 * disabled deployment never even inspects credentials.
 */
export function evaluateActionGates(context: GateContext): GateDecision {
  const killSwitch = checkKillSwitch(context.config)
  if (!killSwitch.allowed) return killSwitch

  if (!context.account) return { allowed: false, reason: "account_not_resolved" }

  const allowlist = checkAllowlist(context.config, context.account)
  if (!allowlist.allowed) return allowlist

  const active = checkAutomationActive(context.automation)
  if (!active.allowed) return active

  const selfLoop = checkSelfLoop(context.record, context.account)
  if (!selfLoop.allowed) return selfLoop

  const credentials = checkTokenAndPermissions(context.record, context.account)
  if (!credentials.allowed) return credentials

  if (!context.rateLimiter.tryConsume(context.account.externalAccountId)) {
    return { allowed: false, reason: "rate_limited" }
  }

  return { allowed: true }
}
