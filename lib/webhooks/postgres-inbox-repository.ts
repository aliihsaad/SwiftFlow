import type { Pool } from "pg"

export interface WebhookInboxRecord {
  id: string
  provider: string
  providerEventKey: string
  providerObject: string
  eventType: string
  workspaceId: string | null
  socialAccountId: string | null
  accountExternalId: string | null
  deliveryHash: string
  payload: Record<string, unknown>
  status: "processing"
  attemptCount: number
  maxAttempts: number
  lockedBy: string
  lockExpiresAt: string
  receivedAt: string
}

export interface WebhookInboxCompletion {
  outcome: "succeeded" | "ignored"
  result?: Record<string, unknown>
  workspaceId?: string | null
  socialAccountId?: string | null
}

export interface WebhookInboxFailure {
  code: string
  message: string
  retryAt: Date
  forceDeadLetter?: boolean
}

export type WebhookInboxFinalizeResult =
  | { updated: true; status: "succeeded" | "ignored" | "retry_scheduled" | "dead_letter" }
  | { updated: false; status: "lost_lease" }

export interface WebhookInboxRepository {
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<WebhookInboxRecord[]>
  complete(
    eventId: string,
    workerId: string,
    completion: WebhookInboxCompletion,
  ): Promise<WebhookInboxFinalizeResult>
  fail(
    eventId: string,
    workerId: string,
    failure: WebhookInboxFailure,
  ): Promise<WebhookInboxFinalizeResult>
  extendLease(eventId: string, workerId: string, leaseSeconds: number): Promise<boolean>
}

export interface PostgresQueryResult {
  rows: Record<string, unknown>[]
  rowCount: number | null
}

export interface PostgresQueryClient {
  query(text: string, values?: unknown[]): Promise<PostgresQueryResult>
}

export const CLAIM_WEBHOOK_INBOX_SQL = `
  select *
  from public.claim_webhook_inbox_events($1, $2, $3)
`

export const COMPLETE_WEBHOOK_INBOX_SQL = `
  update public.webhook_inbox_events
  set
    status = $3,
    workspace_id = coalesce($4::uuid, workspace_id),
    social_account_id = coalesce($5::uuid, social_account_id),
    result = $6::jsonb,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    last_error_code = null,
    last_error_message = null,
    processed_at = now(),
    updated_at = now()
  where id = $1::uuid
    and status = 'processing'
    and locked_by = $2
    and lock_expires_at > now()
  returning status
`

export const FAIL_WEBHOOK_INBOX_SQL = `
  update public.webhook_inbox_events
  set
    status = case
      when $6::boolean or attempt_count >= max_attempts then 'dead_letter'
      else 'retry_scheduled'
    end,
    available_at = case
      when $6::boolean or attempt_count >= max_attempts then available_at
      else $5::timestamptz
    end,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    last_error_code = $3,
    last_error_message = $4,
    processed_at = case
      when $6::boolean or attempt_count >= max_attempts then now()
      else null
    end,
    updated_at = now()
  where id = $1::uuid
    and status = 'processing'
    and locked_by = $2
    and lock_expires_at > now()
  returning status
`

export const EXTEND_WEBHOOK_INBOX_LEASE_SQL = `
  update public.webhook_inbox_events
  set
    lock_expires_at = now() + make_interval(secs => $3),
    updated_at = now()
  where id = $1::uuid
    and status = 'processing'
    and locked_by = $2
    and lock_expires_at > now()
  returning id
`

function clampedInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(Math.max(Math.trunc(value), minimum), maximum)
}

function stringValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === "string" ? value : String(value ?? "")
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value).trim()
  return text || null
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function toInboxRecord(row: Record<string, unknown>): WebhookInboxRecord {
  return {
    id: stringValue(row.id),
    provider: stringValue(row.provider),
    providerEventKey: stringValue(row.provider_event_key),
    providerObject: stringValue(row.provider_object),
    eventType: stringValue(row.event_type),
    workspaceId: nullableString(row.workspace_id),
    socialAccountId: nullableString(row.social_account_id),
    accountExternalId: nullableString(row.account_external_id),
    deliveryHash: stringValue(row.delivery_hash),
    payload: recordValue(row.payload),
    status: "processing",
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 1,
    lockedBy: stringValue(row.locked_by),
    lockExpiresAt: stringValue(row.lock_expires_at),
    receivedAt: stringValue(row.received_at),
  }
}

function finalizeResult(rows: Record<string, unknown>[]): WebhookInboxFinalizeResult {
  const status = nullableString(rows[0]?.status)
  if (
    status === "succeeded"
    || status === "ignored"
    || status === "retry_scheduled"
    || status === "dead_letter"
  ) {
    return { updated: true, status }
  }
  return { updated: false, status: "lost_lease" }
}

function safeErrorText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

function requiredWorkerId(value: string): string {
  const workerId = value.trim()
  if (!workerId) throw new Error("workerId is required")
  return workerId
}

export class PostgresWebhookInboxRepository implements WebhookInboxRepository {
  constructor(private readonly database: PostgresQueryClient) {}

  async claim(
    workerId: string,
    limit: number,
    leaseSeconds: number,
  ): Promise<WebhookInboxRecord[]> {
    const result = await this.database.query(CLAIM_WEBHOOK_INBOX_SQL, [
      requiredWorkerId(workerId),
      clampedInteger(limit, 1, 100),
      clampedInteger(leaseSeconds, 1, 3_600),
    ])
    return result.rows.map(toInboxRecord)
  }

  async complete(
    eventId: string,
    workerId: string,
    completion: WebhookInboxCompletion,
  ): Promise<WebhookInboxFinalizeResult> {
    const result = await this.database.query(COMPLETE_WEBHOOK_INBOX_SQL, [
      eventId,
      requiredWorkerId(workerId),
      completion.outcome,
      completion.workspaceId || null,
      completion.socialAccountId || null,
      JSON.stringify(completion.result || {}),
    ])
    return finalizeResult(result.rows)
  }

  async fail(
    eventId: string,
    workerId: string,
    failure: WebhookInboxFailure,
  ): Promise<WebhookInboxFinalizeResult> {
    const result = await this.database.query(FAIL_WEBHOOK_INBOX_SQL, [
      eventId,
      requiredWorkerId(workerId),
      safeErrorText(failure.code || "worker_error", 120),
      safeErrorText(failure.message || "Webhook worker failed", 1_000),
      failure.retryAt.toISOString(),
      failure.forceDeadLetter === true,
    ])
    return finalizeResult(result.rows)
  }

  async extendLease(eventId: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const result = await this.database.query(EXTEND_WEBHOOK_INBOX_LEASE_SQL, [
      eventId,
      requiredWorkerId(workerId),
      clampedInteger(leaseSeconds, 1, 3_600),
    ])
    return (result.rowCount || 0) > 0
  }
}

export function createPostgresQueryClient(
  pool: Pool,
): PostgresQueryClient {
  return {
    async query(text, values) {
      const result = await pool.query(text, values)
      return {
        rows: result.rows as Record<string, unknown>[],
        rowCount: result.rowCount,
      }
    },
  }
}

export function createPostgresWebhookInboxRepository(
  pool: Pool,
): PostgresWebhookInboxRepository {
  return new PostgresWebhookInboxRepository(createPostgresQueryClient(pool))
}
