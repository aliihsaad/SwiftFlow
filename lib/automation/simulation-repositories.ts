import {
  type ActionOutboxEnqueueResult,
  type ActionOutboxRecord,
  type ActionOutboxStatus,
  type ProviderActionRequest,
  buildProviderActionIdentityKey,
} from "./action-outbox-contract"
import type {
  ActionFinalizeResult,
  ActionOutboxRepository,
} from "./postgres-action-outbox"
import type {
  WebhookInboxEvent,
  WebhookInboxStatus,
  WebhookInboxStore,
} from "../webhooks/inbox-contract"
import type {
  WebhookInboxCompletion,
  WebhookInboxFailure,
  WebhookInboxFinalizeResult,
  WebhookInboxRecord,
  WebhookInboxRepository,
} from "../webhooks/postgres-inbox-repository"

export class SimulationClock {
  private timestamp: number

  constructor(initialTime = "2026-07-28T12:00:00.000Z") {
    const parsed = Date.parse(initialTime)
    if (!Number.isFinite(parsed)) throw new Error("Simulation clock requires a valid initial time")
    this.timestamp = parsed
  }

  nowMs = (): number => this.timestamp

  nowDate = (): Date => new Date(this.timestamp)

  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new Error("Simulation clock can only advance by a non-negative duration")
    }
    this.timestamp += Math.trunc(milliseconds)
  }
}

interface InMemoryWebhookRow {
  id: string
  event: WebhookInboxEvent
  status: WebhookInboxStatus
  attemptCount: number
  maxAttempts: number
  availableAtMs: number
  lockedBy: string | null
  lockExpiresAtMs: number | null
  receivedAt: string
  result: Record<string, unknown>
  lastErrorCode: string | null
}

export interface SimulationWebhookSnapshot {
  id: string
  providerEventKey: string
  status: WebhookInboxStatus
  attemptCount: number
  maxAttempts: number
  result: Record<string, unknown>
  lastErrorCode: string | null
}

export interface SimulationEnqueueMetrics {
  total: number
  inserted: number
  duplicates: number
}

function emptyEnqueueMetrics(): SimulationEnqueueMetrics {
  return { total: 0, inserted: 0, duplicates: 0 }
}

/**
 * Deterministic implementation of the durable webhook inbox contracts.
 *
 * It intentionally mirrors lease expiry, retry availability, deduplication, and
 * terminal-state behavior without opening a database or network connection.
 */
export class InMemoryWebhookInbox
implements WebhookInboxStore, WebhookInboxRepository {
  private readonly rows: InMemoryWebhookRow[] = []
  private readonly keys = new Set<string>()
  private readonly enqueueMetrics = emptyEnqueueMetrics()

  constructor(
    private readonly clock: SimulationClock,
    private readonly defaultMaxAttempts = 8,
  ) {}

  async enqueue(events: WebhookInboxEvent[]): Promise<SimulationEnqueueMetrics> {
    let inserted = 0

    for (const event of events) {
      if (this.keys.has(event.providerEventKey)) continue

      this.keys.add(event.providerEventKey)
      inserted += 1
      this.rows.push({
        id: `simulation-inbox-${this.rows.length + 1}`,
        event,
        status: "pending",
        attemptCount: 0,
        maxAttempts: this.defaultMaxAttempts,
        availableAtMs: this.clock.nowMs(),
        lockedBy: null,
        lockExpiresAtMs: null,
        receivedAt: this.clock.nowDate().toISOString(),
        result: {},
        lastErrorCode: null,
      })
    }

    const result = {
      total: events.length,
      inserted,
      duplicates: events.length - inserted,
    }
    this.enqueueMetrics.total += result.total
    this.enqueueMetrics.inserted += result.inserted
    this.enqueueMetrics.duplicates += result.duplicates
    return result
  }

  async claim(
    workerId: string,
    limit: number,
    leaseSeconds: number,
  ): Promise<WebhookInboxRecord[]> {
    const now = this.clock.nowMs()
    const safeLimit = Math.max(1, Math.trunc(limit))
    const leaseMs = Math.max(1, Math.trunc(leaseSeconds)) * 1_000
    const candidates = this.rows.filter((row) => (
      (row.status === "pending" && row.availableAtMs <= now)
      || (row.status === "retry_scheduled" && row.availableAtMs <= now)
      || (
        row.status === "processing"
        && row.lockExpiresAtMs !== null
        && row.lockExpiresAtMs <= now
      )
    )).slice(0, safeLimit)

    return candidates.map((row) => {
      row.status = "processing"
      row.attemptCount += 1
      row.lockedBy = workerId
      row.lockExpiresAtMs = now + leaseMs

      return {
        id: row.id,
        provider: row.event.provider,
        providerEventKey: row.event.providerEventKey,
        providerObject: row.event.providerObject,
        eventType: row.event.eventType,
        workspaceId: null,
        socialAccountId: null,
        accountExternalId: row.event.accountExternalId,
        deliveryHash: row.event.deliveryHash,
        payload: row.event.payload,
        status: "processing",
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        lockedBy: workerId,
        lockExpiresAt: new Date(row.lockExpiresAtMs as number).toISOString(),
        receivedAt: row.receivedAt,
      }
    })
  }

  async complete(
    eventId: string,
    workerId: string,
    completion: WebhookInboxCompletion,
  ): Promise<WebhookInboxFinalizeResult> {
    const row = this.rows.find((candidate) => candidate.id === eventId)
    if (!row || !this.ownsLiveLease(row, workerId)) {
      return { updated: false, status: "lost_lease" }
    }

    row.status = completion.outcome
    row.result = completion.result || {}
    row.lastErrorCode = null
    this.clearLease(row)
    return { updated: true, status: completion.outcome }
  }

  async fail(
    eventId: string,
    workerId: string,
    failure: WebhookInboxFailure,
  ): Promise<WebhookInboxFinalizeResult> {
    const row = this.rows.find((candidate) => candidate.id === eventId)
    if (!row || !this.ownsLiveLease(row, workerId)) {
      return { updated: false, status: "lost_lease" }
    }

    const deadLetter = failure.forceDeadLetter === true
      || row.attemptCount >= row.maxAttempts
    row.status = deadLetter ? "dead_letter" : "retry_scheduled"
    row.availableAtMs = deadLetter
      ? row.availableAtMs
      : failure.retryAt.getTime()
    row.lastErrorCode = failure.code
    this.clearLease(row)
    return {
      updated: true,
      status: deadLetter ? "dead_letter" : "retry_scheduled",
    }
  }

  async extendLease(
    eventId: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === eventId)
    if (!row || !this.ownsLiveLease(row, workerId)) return false
    row.lockExpiresAtMs = this.clock.nowMs()
      + Math.max(1, Math.trunc(leaseSeconds)) * 1_000
    return true
  }

  metrics(): SimulationEnqueueMetrics {
    return { ...this.enqueueMetrics }
  }

  snapshots(): SimulationWebhookSnapshot[] {
    return this.rows.map((row) => ({
      id: row.id,
      providerEventKey: row.event.providerEventKey,
      status: row.status,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      result: row.result,
      lastErrorCode: row.lastErrorCode,
    }))
  }

  private ownsLiveLease(row: InMemoryWebhookRow, workerId: string): boolean {
    return row.status === "processing"
      && row.lockedBy === workerId
      && row.lockExpiresAtMs !== null
      && row.lockExpiresAtMs > this.clock.nowMs()
  }

  private clearLease(row: InMemoryWebhookRow): void {
    row.lockedBy = null
    row.lockExpiresAtMs = null
  }
}

interface InMemoryActionRow {
  id: string
  request: ProviderActionRequest
  status: ActionOutboxStatus
  attemptCount: number
  maxAttempts: number
  availableAtMs: number
  lockedBy: string | null
  lockExpiresAtMs: number | null
  providerResponseId: string | null
  lastErrorCode: string | null
  suppressedReason: string | null
}

export interface SimulationActionSnapshot {
  id: string
  identityKey: string
  status: ActionOutboxStatus
  attemptCount: number
  maxAttempts: number
  providerResponseId: string | null
  lastErrorCode: string | null
  suppressedReason: string | null
}

/**
 * Deterministic implementation of the provider-action outbox.
 *
 * The identity key is the same one used by the PostgreSQL repository. Replaying
 * a fixture therefore proves the planner produces the same logical action, while
 * the in-memory ledger prevents duplicate recording-adapter calls.
 */
export class InMemoryActionOutbox implements ActionOutboxRepository {
  private readonly rows: InMemoryActionRow[] = []
  private readonly rowsByIdentity = new Map<string, InMemoryActionRow>()
  private readonly enqueueMetrics = emptyEnqueueMetrics()

  constructor(
    private readonly clock: SimulationClock,
    private readonly defaultMaxAttempts = 3,
  ) {}

  async enqueue(
    requests: ProviderActionRequest[],
  ): Promise<ActionOutboxEnqueueResult> {
    let inserted = 0

    for (const request of requests) {
      const identityKey = buildProviderActionIdentityKey(request.identity)
      if (this.rowsByIdentity.has(identityKey)) continue

      const row: InMemoryActionRow = {
        id: `simulation-action-${this.rows.length + 1}`,
        request,
        status: "pending",
        attemptCount: 0,
        maxAttempts: this.defaultMaxAttempts,
        availableAtMs: this.clock.nowMs(),
        lockedBy: null,
        lockExpiresAtMs: null,
        providerResponseId: null,
        lastErrorCode: null,
        suppressedReason: null,
      }
      this.rows.push(row)
      this.rowsByIdentity.set(identityKey, row)
      inserted += 1
    }

    const result = {
      total: requests.length,
      inserted,
      duplicates: requests.length - inserted,
    }
    this.enqueueMetrics.total += result.total
    this.enqueueMetrics.inserted += result.inserted
    this.enqueueMetrics.duplicates += result.duplicates
    return result
  }

  async claim(
    workerId: string,
    limit: number,
    leaseSeconds: number,
  ): Promise<ActionOutboxRecord[]> {
    const now = this.clock.nowMs()
    const safeLimit = Math.max(1, Math.trunc(limit))
    const leaseMs = Math.max(1, Math.trunc(leaseSeconds)) * 1_000
    const candidates = this.rows.filter((row) => (
      (row.status === "pending" && row.availableAtMs <= now)
      || (row.status === "retry_scheduled" && row.availableAtMs <= now)
      || (
        row.status === "claimed"
        && row.lockExpiresAtMs !== null
        && row.lockExpiresAtMs <= now
      )
    )).slice(0, safeLimit)

    return candidates.map((row) => {
      row.status = "claimed"
      row.attemptCount += 1
      row.lockedBy = workerId
      row.lockExpiresAtMs = now + leaseMs

      return {
        id: row.id,
        identity: row.request.identity,
        workspaceId: row.request.workspaceId,
        socialAccountId: row.request.socialAccountId,
        payload: row.request.payload,
        status: "claimed",
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        lockedBy: workerId,
        lockExpiresAt: new Date(row.lockExpiresAtMs as number).toISOString(),
      }
    })
  }

  async complete(
    id: string,
    workerId: string,
    providerResponseId: string | null,
  ): Promise<ActionFinalizeResult> {
    const row = this.rows.find((candidate) => candidate.id === id)
    if (!row || !this.ownsLiveLease(row, workerId)) {
      return { updated: false, status: "lost_lease" }
    }

    row.status = "succeeded"
    row.providerResponseId = providerResponseId
    row.lastErrorCode = null
    this.clearLease(row)
    return { updated: true, status: "succeeded" }
  }

  async fail(
    id: string,
    workerId: string,
    failure: {
      code: string
      message: string
      retryAt: Date
      deadLetter: boolean
      ambiguous?: boolean
    },
  ): Promise<ActionFinalizeResult> {
    const row = this.rows.find((candidate) => candidate.id === id)
    if (!row || !this.ownsLiveLease(row, workerId)) {
      return { updated: false, status: "lost_lease" }
    }

    row.status = failure.deadLetter ? "dead_lettered" : "retry_scheduled"
    row.availableAtMs = failure.deadLetter
      ? row.availableAtMs
      : failure.retryAt.getTime()
    row.lastErrorCode = failure.code
    this.clearLease(row)
    return { updated: true, status: row.status }
  }

  async suppress(
    id: string,
    workerId: string,
    reason: string,
  ): Promise<ActionFinalizeResult> {
    const row = this.rows.find((candidate) => candidate.id === id)
    if (!row || !this.ownsLiveLease(row, workerId)) {
      return { updated: false, status: "lost_lease" }
    }

    row.status = "suppressed"
    row.suppressedReason = reason
    this.clearLease(row)
    return { updated: true, status: "suppressed" }
  }

  async extendLease(
    id: string,
    workerId: string,
    leaseSeconds: number,
  ): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === id)
    if (!row || !this.ownsLiveLease(row, workerId)) return false
    row.lockExpiresAtMs = this.clock.nowMs()
      + Math.max(1, Math.trunc(leaseSeconds)) * 1_000
    return true
  }

  metrics(): SimulationEnqueueMetrics {
    return { ...this.enqueueMetrics }
  }

  snapshots(): SimulationActionSnapshot[] {
    return this.rows.map((row) => ({
      id: row.id,
      identityKey: buildProviderActionIdentityKey(row.request.identity),
      status: row.status,
      attemptCount: row.attemptCount,
      maxAttempts: row.maxAttempts,
      providerResponseId: row.providerResponseId,
      lastErrorCode: row.lastErrorCode,
      suppressedReason: row.suppressedReason,
    }))
  }

  private ownsLiveLease(row: InMemoryActionRow, workerId: string): boolean {
    return row.status === "claimed"
      && row.lockedBy === workerId
      && row.lockExpiresAtMs !== null
      && row.lockExpiresAtMs > this.clock.nowMs()
  }

  private clearLease(row: InMemoryActionRow): void {
    row.lockedBy = null
    row.lockExpiresAtMs = null
  }
}
