import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import {
  ActionExecutor,
  runActionExecutorLoop,
  type ExecutorLookup,
} from "../lib/automation/action-executor"
import {
  resolveActionExecutorConfig,
  type ActionExecutorEnvironment,
  type ExecutorAccount,
  type ExecutorAutomation,
} from "../lib/automation/action-safety-gates"
import { PostgresActionOutboxRepository } from "../lib/automation/postgres-action-outbox"
import { PostgresAutomationRuntimeGuard } from "../lib/automation/automation-runtime-guard"
import { createMetaPrivateReplyAdapter } from "../lib/automation/meta-private-reply-adapter"
import {
  resolveProviderActionAdapter,
  type ProviderActionAdapter,
} from "../lib/automation/provider-action-adapter"
import {
  acquireSingleReplicaLock,
  assertActionExecutorDatabaseAccess,
  assertActionExecutorDatabaseReady,
} from "../lib/automation/action-executor-runtime"
import {
  createPostgresQueryClient,
  type PostgresQueryClient,
} from "../lib/webhooks/postgres-inbox-repository"

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown executor failure"
  return message.replace(/\s+/g, " ").trim().slice(0, 1_000)
}

function createPostgresExecutorLookup(database: PostgresQueryClient): ExecutorLookup {
  return {
    async findAccount(socialAccountId): Promise<ExecutorAccount | null> {
      if (!socialAccountId) return null

      const result = await database.query(`
        select id, account_id, access_token, metadata
        from public.social_accounts
        where id = $1::uuid
      `, [socialAccountId])

      const row = result.rows[0]
      if (!row) return null

      return {
        socialAccountId: String(row.id),
        externalAccountId: String(row.account_id ?? ""),
        accessToken: typeof row.access_token === "string" ? row.access_token : null,
        metadata: (row.metadata && typeof row.metadata === "object"
          ? row.metadata
          : {}) as Record<string, unknown>,
      }
    },

    async findAutomation(automationId): Promise<ExecutorAutomation | null> {
      const result = await database.query(`
        select id, is_active from public.automations where id = $1::uuid
      `, [automationId])

      const row = result.rows[0]
      if (!row) return null
      return { id: String(row.id), isActive: row.is_active === true }
    },
  }
}

/**
 * Gated executor process.
 *
 * The adapter defaults to the disabled one, so a deployment that has not
 * deliberately wired a provider adapter cannot send even with the kill switch
 * on. Enabling real sends requires both the switch and an injected adapter.
 */
export async function runActionExecutorProcess(
  environment: ActionExecutorEnvironment = process.env,
  adapterOverride?: ProviderActionAdapter,
): Promise<void> {
  const config = resolveActionExecutorConfig(environment)

  // The real adapter is only constructed when provider actions are enabled, so
  // with the kill switch off nothing in this process is capable of a network
  // call. The gates would suppress the action regardless; this removes the
  // capability rather than relying on a single check.
  const adapter = adapterOverride ?? resolveProviderActionAdapter(
    config.providerActionsEnabled,
    () => createMetaPrivateReplyAdapter(),
  )

  const pool = createPostgresPool(environment)
  const controller = new AbortController()

  const shutdown = (signal: NodeJS.Signals) => {
    if (!controller.signal.aborted) {
      console.info("[ACTION_EXECUTOR] Shutdown requested", { signal })
      controller.abort()
    }
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  let singleReplicaLock
  try {
    const database = createPostgresQueryClient(pool)
    await assertActionExecutorDatabaseReady(database)
    await assertActionExecutorDatabaseAccess(database)

    // Refuses to start if another executor is already running.
    singleReplicaLock = await acquireSingleReplicaLock(pool)

    const executor = new ActionExecutor({
      config,
      repository: new PostgresActionOutboxRepository(database),
      lookup: createPostgresExecutorLookup(database),
      adapter,
      runtimeGuard: new PostgresAutomationRuntimeGuard(database),
      onEvent: (event) => console.info("[ACTION_EXECUTOR]", event),
    })

    console.info("[ACTION_EXECUTOR] Ready", {
      workerId: config.workerId,
      batchSize: config.batchSize,
      leaseSeconds: config.leaseSeconds,
      runOnce: config.runOnce,
      adapter: adapter.name,
      providerActionsEnabled: config.providerActionsEnabled,
      allowlistSize: config.allowlist.length,
      durableRuntimeGuardsRequired: config.durableRuntimeGuardsRequired,
      providerSendAccountBudget: config.providerSendAccountBudget,
      providerSendAutomationBudget: config.providerSendAutomationBudget,
      providerSendBudgetWindowSeconds: config.providerSendBudgetWindowSeconds,
    })

    if (config.runOnce) {
      console.info("[ACTION_EXECUTOR] One-shot complete", await executor.runOnce(controller.signal))
      return
    }

    const totals = await runActionExecutorLoop(executor, {
      signal: controller.signal,
      pollIntervalMs: config.pollIntervalMs,
      onRun(run) {
        if (run.claimed > 0) console.info("[ACTION_EXECUTOR] Batch complete", run)
      },
    })
    console.info("[ACTION_EXECUTOR] Stopped", totals)
  } finally {
    process.removeListener("SIGINT", shutdown)
    process.removeListener("SIGTERM", shutdown)
    if (singleReplicaLock) {
      await singleReplicaLock.release().catch(() => undefined)
    }
    await pool.end()
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runActionExecutorProcess().catch((error) => {
    console.error("[ACTION_EXECUTOR] Stopped unexpectedly", { message: safeErrorMessage(error) })
    process.exitCode = 1
  })
}
