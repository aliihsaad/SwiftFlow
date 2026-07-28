import type { ActionOutboxRecord } from "./action-outbox-contract"
import {
  AccountRateLimiter,
  evaluateActionGates,
  type ActionExecutorConfig,
  type ExecutorAccount,
  type ExecutorAutomation,
} from "./action-safety-gates"
import { decideRetry, redactProviderError } from "./action-retry-policy"
import type { ActionOutboxRepository } from "./postgres-action-outbox"
import type { ProviderActionAdapter } from "./provider-action-adapter"
import type {
  AutomationRuntimeGuard,
  AutomationRuntimeGuardPolicy,
  AutomationRuntimeGuardScope,
} from "./automation-runtime-guard"

export interface ExecutorLookup {
  findAccount(socialAccountId: string | null): Promise<ExecutorAccount | null>
  findAutomation(automationId: string): Promise<ExecutorAutomation | null>
}

export interface ActionExecutorRun {
  claimed: number
  sent: number
  suppressed: number
  retryScheduled: number
  deadLettered: number
  lostLease: number
}

export interface ActionExecutorOptions {
  config: ActionExecutorConfig
  repository: ActionOutboxRepository
  lookup: ExecutorLookup
  adapter: ProviderActionAdapter
  rateLimiter?: AccountRateLimiter
  runtimeGuard?: AutomationRuntimeGuard
  onEvent?: (event: Record<string, unknown>) => void
}

function emptyRun(): ActionExecutorRun {
  return { claimed: 0, sent: 0, suppressed: 0, retryScheduled: 0, deadLettered: 0, lostLease: 0 }
}

/**
 * Executes queued provider actions.
 *
 * The only component in the system permitted to make an external call, and it
 * makes one only after every gate in evaluateActionGates has passed. A claimed
 * row is always finalised - succeeded, suppressed, retried, or dead-lettered -
 * so nothing is left holding a lease on the happy path.
 */
export class ActionExecutor {
  private readonly rateLimiter: AccountRateLimiter

  constructor(private readonly options: ActionExecutorOptions) {
    this.rateLimiter = options.rateLimiter
      ?? new AccountRateLimiter(options.config.maxActionsPerAccount, options.config.rateWindowMs)
  }

  private emit(event: Record<string, unknown>): void {
    this.options.onEvent?.(event)
  }

  async runOnce(signal?: AbortSignal): Promise<ActionExecutorRun> {
    const run = emptyRun()
    const { config, repository } = this.options

    const claimed = await repository.claim(config.workerId, config.batchSize, config.leaseSeconds)
    run.claimed = claimed.length

    for (const record of claimed) {
      if (signal?.aborted) break
      await this.processOne(record, run)
    }

    this.rateLimiter.prune()
    return run
  }

  private async processOne(record: ActionOutboxRecord, run: ActionExecutorRun): Promise<void> {
    const { config, repository, lookup, adapter } = this.options

    const [account, automation] = await Promise.all([
      lookup.findAccount(record.socialAccountId),
      lookup.findAutomation(record.identity.automationId),
    ])

    const decision = evaluateActionGates({
      config,
      record,
      account,
      automation,
      rateLimiter: this.rateLimiter,
    })

    if (!decision.allowed) {
      const result = await repository.suppress(record.id, config.workerId, decision.reason)
      if (result.updated) run.suppressed += 1
      else run.lostLease += 1

      this.emit({
        event: "action_suppressed",
        actionId: record.id,
        actionType: record.identity.actionType,
        reason: decision.reason,
      })
      return
    }

    const guardScope: AutomationRuntimeGuardScope | null =
      record.workspaceId && record.socialAccountId
        ? {
            workspaceId: record.workspaceId,
            socialAccountId: record.socialAccountId,
            automationId: record.identity.automationId,
            resourceKind: "provider_send",
          }
        : null
    const guardPolicy: AutomationRuntimeGuardPolicy = {
      accountLimit: config.providerSendAccountBudget,
      automationLimit: config.providerSendAutomationBudget,
      windowSeconds: config.providerSendBudgetWindowSeconds,
      failureThreshold: config.providerSendCircuitFailureThreshold,
      cooldownSeconds: config.providerSendCircuitCooldownSeconds,
    }

    let guardDeniedReason: string | null = null
    if (!guardScope && config.durableRuntimeGuardsRequired) {
      guardDeniedReason = "runtime_guard_scope_missing"
    } else if (!this.options.runtimeGuard && config.durableRuntimeGuardsRequired) {
      guardDeniedReason = "runtime_guard_unavailable"
    } else if (guardScope && this.options.runtimeGuard) {
      try {
        const reservation = await this.options.runtimeGuard.reserve(guardScope, guardPolicy)
        if (!reservation.allowed) guardDeniedReason = reservation.reason
      } catch {
        guardDeniedReason = "runtime_guard_unavailable"
      }
    }

    if (guardDeniedReason) {
      const result = await repository.suppress(
        record.id,
        config.workerId,
        guardDeniedReason,
      )
      if (result.updated) run.suppressed += 1
      else run.lostLease += 1
      this.emit({
        event: "action_suppressed",
        actionId: record.id,
        actionType: record.identity.actionType,
        reason: guardDeniedReason,
      })
      return
    }

    // Only reachable once every gate has passed.
    const resolvedAccount = account as ExecutorAccount
    let outcome
    try {
      outcome = await adapter.send(record, {
        accessToken: resolvedAccount.accessToken as string,
        externalAccountId: resolvedAccount.externalAccountId,
      })
    } catch (error) {
      outcome = {
        ok: false as const,
        failure: { message: redactProviderError(error), ambiguous: true },
      }
    }

    if (guardScope && this.options.runtimeGuard) {
      try {
        await this.options.runtimeGuard.recordOutcome(guardScope, guardPolicy, {
          succeeded: outcome.ok,
          failureCode: outcome.ok ? undefined : String(outcome.failure.code ?? "provider_error"),
        })
      } catch {
        this.emit({
          event: "runtime_guard_outcome_record_failed",
          actionId: record.id,
          actionType: record.identity.actionType,
        })
      }
    }

    if (outcome.ok) {
      const result = await repository.complete(
        record.id,
        config.workerId,
        outcome.providerResponseId,
        outcome.response,
      )
      if (result.updated) run.sent += 1
      else run.lostLease += 1

      this.emit({
        event: "action_sent",
        actionId: record.id,
        actionType: record.identity.actionType,
        providerResponseId: outcome.providerResponseId,
        attempt: record.attemptCount,
      })
      return
    }

    const retry = decideRetry(record.attemptCount, record.maxAttempts, outcome.failure)
    const result = await repository.fail(record.id, config.workerId, {
      code: String(outcome.failure.code ?? retry.reason),
      message: redactProviderError(outcome.failure.message),
      retryAt: new Date(Date.now() + retry.delayMs),
      deadLetter: !retry.retryable,
      ambiguous: outcome.failure.ambiguous === true,
    })

    if (!result.updated) run.lostLease += 1
    else if (retry.retryable) run.retryScheduled += 1
    else run.deadLettered += 1

    this.emit({
      event: retry.retryable ? "action_retry_scheduled" : "action_dead_lettered",
      actionId: record.id,
      actionType: record.identity.actionType,
      classification: retry.classification,
      reason: retry.reason,
      attempt: record.attemptCount,
      delayMs: retry.delayMs,
    })
  }
}

export async function runActionExecutorLoop(
  executor: ActionExecutor,
  options: { signal: AbortSignal; pollIntervalMs: number; onRun?: (run: ActionExecutorRun) => void },
): Promise<ActionExecutorRun> {
  const totals = emptyRun()

  while (!options.signal.aborted) {
    const run = await executor.runOnce(options.signal)
    totals.claimed += run.claimed
    totals.sent += run.sent
    totals.suppressed += run.suppressed
    totals.retryScheduled += run.retryScheduled
    totals.deadLettered += run.deadLettered
    totals.lostLease += run.lostLease
    options.onRun?.(run)

    if (options.signal.aborted) break
    if (run.claimed === 0) {
      await new Promise((resolve) => setTimeout(resolve, options.pollIntervalMs))
    }
  }

  return totals
}
