import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { createPostgresPool } from "../lib/database/postgres"
import { createCommentPrivateReplyComparisonWorker } from "../lib/webhooks/comment-comparison-worker"
import {
  assertCommentComparisonDatabaseAccess,
  assertCommentComparisonDatabaseReady,
  resolveCommentComparisonWorkerConfig,
  type CommentComparisonRuntimeEnvironment,
} from "../lib/webhooks/comment-comparison-runtime"
import {
  runWebhookInboxWorkerLoop,
  type WebhookInboxWorkerRun,
} from "../lib/webhooks/inbox-worker"
import { createPostgresQueryClient } from "../lib/webhooks/postgres-inbox-repository"

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown worker failure"
  return message.replace(/\s+/g, " ").trim().slice(0, 1_000)
}

function hasActivity(run: WebhookInboxWorkerRun): boolean {
  return run.claimed > 0 || run.lostLease > 0
}

export async function runCommentComparisonWorkerProcess(
  environment: CommentComparisonRuntimeEnvironment = process.env,
): Promise<void> {
  const config = resolveCommentComparisonWorkerConfig(environment)
  const pool = createPostgresPool(environment)
  const controller = new AbortController()
  const signalHandlers = (["SIGINT", "SIGTERM"] as const).map((signal) => {
    const handler = () => {
      if (!controller.signal.aborted) {
        console.info("[WEBHOOK_COMPARISON] Shutdown requested", { signal })
        controller.abort()
      }
    }
    process.once(signal, handler)
    return { signal, handler }
  })

  try {
    const database = createPostgresQueryClient(pool)
    await assertCommentComparisonDatabaseReady(database)
    await assertCommentComparisonDatabaseAccess(database)
    const worker = createCommentPrivateReplyComparisonWorker(pool, config)

    console.info("[WEBHOOK_COMPARISON] Worker ready", {
      workerId: config.workerId,
      batchSize: config.batchSize,
      leaseSeconds: config.leaseSeconds,
      pollIntervalMs: config.pollIntervalMs,
      runOnce: config.runOnce,
      enqueueActions: config.enqueueActions,
      // Enqueueing an intended action is not a provider side effect; this
      // worker never makes an external call under any configuration.
      sideEffectsEnabled: false,
    })
    if (config.runOnce) {
      const run = await worker.runOnce(controller.signal)
      console.info("[WEBHOOK_COMPARISON] One-shot complete", run)
      return
    }

    const totals = await runWebhookInboxWorkerLoop(worker, {
      signal: controller.signal,
      pollIntervalMs: config.pollIntervalMs,
      onRun(run) {
        if (!hasActivity(run)) return
        console.info("[WEBHOOK_COMPARISON] Batch complete", run)
      },
    })

    console.info("[WEBHOOK_COMPARISON] Worker stopped", totals)
  } finally {
    for (const { signal, handler } of signalHandlers) {
      process.removeListener(signal, handler)
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
  runCommentComparisonWorkerProcess().catch((error) => {
    console.error("[WEBHOOK_COMPARISON] Worker stopped unexpectedly", {
      message: safeErrorMessage(error),
    })
    process.exitCode = 1
  })
}
