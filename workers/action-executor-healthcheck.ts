import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import {
  assertActionExecutorDatabaseAccess,
  assertActionExecutorDatabaseReady,
} from "../lib/automation/action-executor-runtime"
import { resolveActionExecutorConfig } from "../lib/automation/action-safety-gates"
import { createPostgresQueryClient } from "../lib/webhooks/postgres-inbox-repository"

export async function runActionExecutorHealthcheck(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = resolveActionExecutorConfig(environment)
  const pool = createPostgresPool(environment)

  try {
    const database = createPostgresQueryClient(pool)
    await assertActionExecutorDatabaseReady(database)
    await assertActionExecutorDatabaseAccess(database)
  } finally {
    await pool.end()
  }

  // Surfaces the gate posture in `docker inspect` health output without ever
  // touching a credential.
  console.info("[ACTION_EXECUTOR] Healthy", {
    providerActionsEnabled: config.providerActionsEnabled,
    allowlistSize: config.allowlist.length,
    durableRuntimeGuardsRequired: config.durableRuntimeGuardsRequired,
    providerSendAccountBudget: config.providerSendAccountBudget,
    providerSendAutomationBudget: config.providerSendAutomationBudget,
    providerSendBudgetWindowSeconds: config.providerSendBudgetWindowSeconds,
  })
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runActionExecutorHealthcheck().catch((error) => {
    console.error("[ACTION_EXECUTOR] Healthcheck failed", {
      message: error instanceof Error ? error.message : "Unknown healthcheck failure",
    })
    process.exitCode = 1
  })
}
