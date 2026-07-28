import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import {
  assertCommentComparisonDatabaseAccess,
  assertCommentComparisonDatabaseReady,
} from "../lib/webhooks/comment-comparison-runtime"
import { createPostgresQueryClient } from "../lib/webhooks/postgres-inbox-repository"

export async function runCommentComparisonHealthcheck(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const pool = createPostgresPool(environment)
  try {
    const database = createPostgresQueryClient(pool)
    await assertCommentComparisonDatabaseReady(database)
    await assertCommentComparisonDatabaseAccess(database)
  } finally {
    await pool.end()
  }
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  if (!entryPath) return false
  return resolve(entryPath) === fileURLToPath(import.meta.url)
}

if (isDirectExecution()) {
  runCommentComparisonHealthcheck().catch((error) => {
    console.error("[WEBHOOK_COMPARISON] Healthcheck failed", {
      message: error instanceof Error ? error.message : "Unknown healthcheck failure",
    })
    process.exitCode = 1
  })
}
