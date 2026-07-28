import { describe, expect, it } from "vitest"

import {
  PermanentWebhookInboxError,
  RetryableWebhookInboxError,
  WebhookInboxWorker,
  computeWebhookRetryDelayMs,
  runWebhookInboxWorkerLoop,
} from "@/lib/webhooks/inbox-worker"
import type {
  WebhookInboxCompletion,
  WebhookInboxFailure,
  WebhookInboxFinalizeResult,
  WebhookInboxRecord,
  WebhookInboxRepository,
} from "@/lib/webhooks/postgres-inbox-repository"

type FakeStatus =
  | "pending"
  | "processing"
  | "retry_scheduled"
  | "succeeded"
  | "ignored"
  | "dead_letter"

interface FakeRow extends Omit<WebhookInboxRecord, "status" | "lockedBy" | "lockExpiresAt"> {
  status: FakeStatus
  lockedBy: string | null
  lockExpiresAtMs: number | null
  availableAtMs: number
  result?: Record<string, unknown>
  lastErrorCode?: string
}

class FakeWebhookInboxRepository implements WebhookInboxRepository {
  rows: FakeRow[] = []

  constructor(public nowMs = Date.parse("2026-07-26T13:00:00.000Z")) {}

  seed(id = "event-1", overrides: Partial<FakeRow> = {}) {
    this.rows.push({
      id,
      provider: "meta",
      providerEventKey: `comments:${id}`,
      providerObject: "instagram",
      eventType: "comments",
      workspaceId: null,
      socialAccountId: null,
      accountExternalId: "account-1",
      deliveryHash: "a".repeat(64),
      payload: {},
      status: "pending",
      attemptCount: 0,
      maxAttempts: 3,
      lockedBy: null,
      lockExpiresAtMs: null,
      availableAtMs: this.nowMs,
      receivedAt: new Date(this.nowMs).toISOString(),
      ...overrides,
    })
  }

  async claim(workerId: string, limit: number, leaseSeconds: number) {
    const claimable = this.rows
      .filter((row) =>
        row.attemptCount < row.maxAttempts
        && (
          (
            (row.status === "pending" || row.status === "retry_scheduled")
            && row.availableAtMs <= this.nowMs
          )
          || (
            row.status === "processing"
            && (row.lockExpiresAtMs || 0) <= this.nowMs
          )
        ))
      .slice(0, limit)

    for (const row of claimable) {
      row.status = "processing"
      row.attemptCount += 1
      row.lockedBy = workerId
      row.lockExpiresAtMs = this.nowMs + leaseSeconds * 1_000
    }
    return claimable.map((row) => this.toRecord(row))
  }

  async complete(
    eventId: string,
    workerId: string,
    completion: WebhookInboxCompletion,
  ): Promise<WebhookInboxFinalizeResult> {
    const row = this.ownedRow(eventId, workerId)
    if (!row) return { updated: false, status: "lost_lease" }
    row.status = completion.outcome
    row.workspaceId = completion.workspaceId || row.workspaceId
    row.socialAccountId = completion.socialAccountId || row.socialAccountId
    row.result = completion.result
    row.lockedBy = null
    row.lockExpiresAtMs = null
    return { updated: true, status: completion.outcome }
  }

  async fail(
    eventId: string,
    workerId: string,
    failure: WebhookInboxFailure,
  ): Promise<WebhookInboxFinalizeResult> {
    const row = this.ownedRow(eventId, workerId)
    if (!row) return { updated: false, status: "lost_lease" }
    const deadLetter = failure.forceDeadLetter === true || row.attemptCount >= row.maxAttempts
    row.status = deadLetter ? "dead_letter" : "retry_scheduled"
    row.availableAtMs = failure.retryAt.getTime()
    row.lastErrorCode = failure.code
    row.lockedBy = null
    row.lockExpiresAtMs = null
    return { updated: true, status: row.status }
  }

  async extendLease(eventId: string, workerId: string, leaseSeconds: number) {
    const row = this.ownedRow(eventId, workerId)
    if (!row) return false
    row.lockExpiresAtMs = this.nowMs + leaseSeconds * 1_000
    return true
  }

  advance(milliseconds: number) {
    this.nowMs += milliseconds
  }

  private ownedRow(eventId: string, workerId: string) {
    return this.rows.find((row) =>
      row.id === eventId
      && row.status === "processing"
      && row.lockedBy === workerId
      && (row.lockExpiresAtMs || 0) > this.nowMs)
  }

  private toRecord(row: FakeRow): WebhookInboxRecord {
    return {
      ...row,
      status: "processing",
      lockedBy: row.lockedBy || "",
      lockExpiresAt: new Date(row.lockExpiresAtMs || this.nowMs).toISOString(),
    }
  }
}

describe("WebhookInboxWorker", () => {
  it("completes a comparison event and records resolved ownership", async () => {
    const repository = new FakeWebhookInboxRepository()
    repository.seed()
    const worker = new WebhookInboxWorker(repository, async () => ({
      outcome: "succeeded",
      workspaceId: "workspace-1",
      socialAccountId: "social-1",
      result: { mode: "comparison", sideEffectsExecuted: false },
    }), {
      workerId: " worker-1 ",
      now: () => new Date(repository.nowMs),
    })

    await expect(worker.runOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      ignored: 0,
      retryScheduled: 0,
      deadLettered: 0,
      lostLease: 0,
    })
    expect(repository.rows[0]).toMatchObject({
      status: "succeeded",
      workspaceId: "workspace-1",
      lockedBy: null,
      result: { sideEffectsExecuted: false },
    })
  })

  it("backs off retryable failures and dead-letters permanent failures", async () => {
    const repository = new FakeWebhookInboxRepository()
    repository.seed("retry")
    repository.seed("permanent")
    const worker = new WebhookInboxWorker(repository, async (event) => {
      if (event.id === "permanent") {
        throw new PermanentWebhookInboxError("Malformed payload", "invalid_payload")
      }
      throw new RetryableWebhookInboxError("Provider unavailable", "provider_unavailable")
    }, {
      workerId: "worker-1",
      batchSize: 2,
      retryBaseMs: 2_000,
      now: () => new Date(repository.nowMs),
    })

    const run = await worker.runOnce()

    expect(run).toMatchObject({ retryScheduled: 1, deadLettered: 1 })
    expect(repository.rows.find((row) => row.id === "retry")).toMatchObject({
      status: "retry_scheduled",
      lastErrorCode: "provider_unavailable",
      availableAtMs: repository.nowMs + 2_000,
    })
    expect(repository.rows.find((row) => row.id === "permanent")).toMatchObject({
      status: "dead_letter",
      lastErrorCode: "invalid_payload",
    })
  })

  it("recovers an expired crash lease without accepting the stale worker completion", async () => {
    const repository = new FakeWebhookInboxRepository()
    repository.seed()
    const [firstClaim] = await repository.claim("crashed-worker", 1, 30)
    repository.advance(31_000)

    const worker = new WebhookInboxWorker(repository, async () => ({
      outcome: "succeeded",
      result: { recovered: true },
    }), {
      workerId: "recovery-worker",
      leaseSeconds: 30,
      now: () => new Date(repository.nowMs),
    })

    await expect(worker.runOnce()).resolves.toMatchObject({ claimed: 1, succeeded: 1 })
    await expect(repository.complete(firstClaim!.id, "crashed-worker", {
      outcome: "succeeded",
    })).resolves.toEqual({ updated: false, status: "lost_lease" })
    expect(repository.rows[0]).toMatchObject({
      status: "succeeded",
      attemptCount: 2,
      result: { recovered: true },
    })
  })

  it("allows only one of two concurrent workers to claim the same event", async () => {
    const repository = new FakeWebhookInboxRepository()
    repository.seed()
    let handled = 0
    const handler = async () => {
      handled += 1
      return { outcome: "succeeded" as const }
    }
    const first = new WebhookInboxWorker(repository, handler, { workerId: "worker-1" })
    const second = new WebhookInboxWorker(repository, handler, { workerId: "worker-2" })

    const runs = await Promise.all([first.runOnce(), second.runOnce()])

    expect(runs.reduce((sum, run) => sum + run.claimed, 0)).toBe(1)
    expect(handled).toBe(1)
  })

  it("stops the polling loop gracefully after the abort signal", async () => {
    const repository = new FakeWebhookInboxRepository()
    repository.seed()
    const controller = new AbortController()
    const worker = new WebhookInboxWorker(repository, async () => ({
      outcome: "succeeded",
    }), { workerId: "worker-1" })

    const totals = await runWebhookInboxWorkerLoop(worker, {
      signal: controller.signal,
      onRun() {
        controller.abort()
      },
    })

    expect(totals).toMatchObject({ claimed: 1, succeeded: 1 })
    expect(controller.signal.aborted).toBe(true)
  })

  it("uses capped exponential retry delays", () => {
    expect(computeWebhookRetryDelayMs(1, 1_000, 10_000)).toBe(1_000)
    expect(computeWebhookRetryDelayMs(3, 1_000, 10_000)).toBe(4_000)
    expect(computeWebhookRetryDelayMs(8, 1_000, 10_000)).toBe(10_000)
  })
})
