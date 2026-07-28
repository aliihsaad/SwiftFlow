import type {
  WebhookInboxRecord,
  WebhookInboxRepository,
} from "./postgres-inbox-repository"

export interface WebhookInboxHandlerResult {
  outcome: "succeeded" | "ignored"
  result?: Record<string, unknown>
  workspaceId?: string | null
  socialAccountId?: string | null
}

export interface WebhookInboxHandlerContext {
  signal?: AbortSignal
  heartbeat(): Promise<boolean>
}

export type WebhookInboxHandler = (
  event: WebhookInboxRecord,
  context: WebhookInboxHandlerContext,
) => Promise<WebhookInboxHandlerResult>

export interface WebhookInboxWorkerOptions {
  workerId: string
  batchSize?: number
  leaseSeconds?: number
  retryBaseMs?: number
  retryMaxMs?: number
  now?: () => Date
}

export interface WebhookInboxWorkerRun {
  claimed: number
  succeeded: number
  ignored: number
  retryScheduled: number
  deadLettered: number
  lostLease: number
}

export class PermanentWebhookInboxError extends Error {
  constructor(
    message: string,
    readonly code = "permanent_webhook_error",
  ) {
    super(message)
    this.name = "PermanentWebhookInboxError"
  }
}

export class RetryableWebhookInboxError extends Error {
  constructor(
    message: string,
    readonly code = "retryable_webhook_error",
    readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = "RetryableWebhookInboxError"
  }
}

export function computeWebhookRetryDelayMs(
  attemptCount: number,
  baseMs = 5_000,
  maxMs = 15 * 60_000,
): number {
  const safeAttempt = Math.max(1, Math.trunc(attemptCount) || 1)
  const safeBase = Math.max(1, Math.trunc(baseMs) || 1)
  const safeMax = Math.max(safeBase, Math.trunc(maxMs) || safeBase)
  return Math.min(safeBase * (2 ** (safeAttempt - 1)), safeMax)
}

function emptyRun(): WebhookInboxWorkerRun {
  return {
    claimed: 0,
    succeeded: 0,
    ignored: 0,
    retryScheduled: 0,
    deadLettered: 0,
    lostLease: 0,
  }
}

function errorDetails(
  error: unknown,
  event: WebhookInboxRecord,
  options: Required<Pick<WebhookInboxWorkerOptions, "retryBaseMs" | "retryMaxMs">>,
) {
  if (error instanceof PermanentWebhookInboxError) {
    return {
      code: error.code,
      message: error.message,
      delayMs: 0,
      forceDeadLetter: true,
    }
  }

  if (error instanceof RetryableWebhookInboxError) {
    return {
      code: error.code,
      message: error.message,
      delayMs: error.retryAfterMs ?? computeWebhookRetryDelayMs(
        event.attemptCount,
        options.retryBaseMs,
        options.retryMaxMs,
      ),
      forceDeadLetter: false,
    }
  }

  return {
    code: "unhandled_worker_error",
    message: error instanceof Error ? error.message : "Unknown webhook worker failure",
    delayMs: computeWebhookRetryDelayMs(
      event.attemptCount,
      options.retryBaseMs,
      options.retryMaxMs,
    ),
    forceDeadLetter: false,
  }
}

export class WebhookInboxWorker {
  private readonly workerId: string
  private readonly batchSize: number
  private readonly leaseSeconds: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly now: () => Date

  constructor(
    private readonly repository: WebhookInboxRepository,
    private readonly handler: WebhookInboxHandler,
    options: WebhookInboxWorkerOptions,
  ) {
    this.workerId = options.workerId.trim()
    if (!this.workerId) throw new Error("workerId is required")
    this.batchSize = options.batchSize ?? 10
    this.leaseSeconds = options.leaseSeconds ?? 60
    this.retryBaseMs = options.retryBaseMs ?? 5_000
    this.retryMaxMs = options.retryMaxMs ?? 15 * 60_000
    this.now = options.now ?? (() => new Date())
  }

  async runOnce(signal?: AbortSignal): Promise<WebhookInboxWorkerRun> {
    const run = emptyRun()
    if (signal?.aborted) return run

    const events = await this.repository.claim(
      this.workerId,
      this.batchSize,
      this.leaseSeconds,
    )
    run.claimed = events.length

    for (const event of events) {
      if (signal?.aborted) {
        const retryResult = await this.repository.fail(event.id, this.workerId, {
          code: "worker_shutdown",
          message: "Worker stopped before processing the claimed event",
          retryAt: this.now(),
        })
        this.countFinalize(run, retryResult)
        continue
      }

      try {
        const handlerResult = await this.handler(event, {
          signal,
          heartbeat: () => this.repository.extendLease(
            event.id,
            this.workerId,
            this.leaseSeconds,
          ),
        })
        const finalResult = await this.repository.complete(event.id, this.workerId, {
          outcome: handlerResult.outcome,
          result: handlerResult.result,
          workspaceId: handlerResult.workspaceId,
          socialAccountId: handlerResult.socialAccountId,
        })
        this.countFinalize(run, finalResult)
      } catch (error) {
        const details = errorDetails(error, event, {
          retryBaseMs: this.retryBaseMs,
          retryMaxMs: this.retryMaxMs,
        })
        const retryAt = new Date(this.now().getTime() + Math.max(0, details.delayMs))
        const finalResult = await this.repository.fail(event.id, this.workerId, {
          code: details.code,
          message: details.message,
          retryAt,
          forceDeadLetter: details.forceDeadLetter,
        })
        this.countFinalize(run, finalResult)
      }
    }

    return run
  }

  private countFinalize(
    run: WebhookInboxWorkerRun,
    result: Awaited<ReturnType<WebhookInboxRepository["complete"]>>,
  ) {
    if (!result.updated) {
      run.lostLease += 1
      return
    }
    if (result.status === "succeeded") run.succeeded += 1
    if (result.status === "ignored") run.ignored += 1
    if (result.status === "retry_scheduled") run.retryScheduled += 1
    if (result.status === "dead_letter") run.deadLettered += 1
  }
}

export interface WebhookInboxWorkerLoopOptions {
  signal?: AbortSignal
  pollIntervalMs?: number
  onRun?(run: WebhookInboxWorkerRun): void | Promise<void>
}

function waitForNextPoll(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()

  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", finish)
      resolve()
    }
    const timeout = setTimeout(finish, Math.max(1, milliseconds))
    signal?.addEventListener("abort", finish, { once: true })
    if (signal?.aborted) finish()
  })
}

export async function runWebhookInboxWorkerLoop(
  worker: WebhookInboxWorker,
  options: WebhookInboxWorkerLoopOptions = {},
): Promise<WebhookInboxWorkerRun> {
  const totals = emptyRun()
  const pollIntervalMs = Math.max(1, options.pollIntervalMs ?? 1_000)

  while (!options.signal?.aborted) {
    const run = await worker.runOnce(options.signal)
    totals.claimed += run.claimed
    totals.succeeded += run.succeeded
    totals.ignored += run.ignored
    totals.retryScheduled += run.retryScheduled
    totals.deadLettered += run.deadLettered
    totals.lostLease += run.lostLease

    await options.onRun?.(run)
    if (options.signal?.aborted) break

    if (run.claimed === 0) {
      await waitForNextPoll(pollIntervalMs, options.signal)
    }
  }

  return totals
}
