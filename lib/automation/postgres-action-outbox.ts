import type { PostgresQueryClient } from "../webhooks/postgres-inbox-repository"
import {
  type ActionOutboxEnqueueResult,
  type ActionOutboxRecord,
  type ProviderActionRequest,
  buildProviderActionIdentityKey,
} from "./action-outbox-contract"

/** Columns the enqueue path is granted, in statement order. */
export const ACTION_OUTBOX_INSERT_COLUMNS = [
  "provider",
  "provider_event_key",
  "automation_id",
  "workflow_version_id",
  "node_id",
  "action_type",
  "target_id",
  "workspace_id",
  "social_account_id",
  "action_payload",
] as const

/**
 * Appends intended actions.
 *
 * As with the durable inbox, there is deliberately no `returning` clause and no
 * `on conflict` target: both require `select` privilege, and the enqueueing
 * comparison role is insert-only by design. The untargeted `do nothing` is
 * unambiguous because `automation_action_outbox` has exactly one unique
 * constraint besides its defaulted primary key, which an integration test pins.
 */
export const ENQUEUE_ACTION_SQL = `
  insert into public.automation_action_outbox (
    ${ACTION_OUTBOX_INSERT_COLUMNS.join(",\n    ")}
  )
  values ($1, $2, $3::uuid, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::jsonb)
  on conflict do nothing
`

export const CLAIM_ACTIONS_SQL = `
  select * from public.claim_automation_actions($1, $2, $3)
`

export const COMPLETE_ACTION_SQL = `
  update public.automation_action_outbox
  set
    status = 'succeeded',
    provider_response_id = $3,
    provider_response = $4::jsonb,
    last_error_code = null,
    last_error_message = null,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    processed_at = now(),
    updated_at = now()
  where id = $1::uuid
    and status = 'claimed'
    and locked_by = $2
    and lock_expires_at > now()
  returning status
`

export const FAIL_ACTION_SQL = `
  update public.automation_action_outbox
  set
    status = case when $6::boolean then 'dead_lettered' else 'retry_scheduled' end,
    available_at = case when $6::boolean then available_at else $5::timestamptz end,
    last_error_code = $3,
    last_error_message = $4,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    processed_at = case when $6::boolean then now() else null end,
    updated_at = now()
  where id = $1::uuid
    and status = 'claimed'
    and locked_by = $2
    and lock_expires_at > now()
  returning status
`

export const SUPPRESS_ACTION_SQL = `
  update public.automation_action_outbox
  set
    status = 'suppressed',
    suppressed_reason = $3,
    locked_at = null,
    lock_expires_at = null,
    locked_by = null,
    processed_at = now(),
    updated_at = now()
  where id = $1::uuid
    and status = 'claimed'
    and locked_by = $2
    and lock_expires_at > now()
  returning status
`

export const EXTEND_ACTION_LEASE_SQL = `
  update public.automation_action_outbox
  set lock_expires_at = now() + make_interval(secs => $3), updated_at = now()
  where id = $1::uuid
    and status = 'claimed'
    and locked_by = $2
    and lock_expires_at > now()
  returning id
`

export type ActionFinalizeResult =
  | { updated: true; status: string }
  | { updated: false; status: "lost_lease" }

export interface ActionOutboxRepository {
  enqueue(requests: ProviderActionRequest[]): Promise<ActionOutboxEnqueueResult>
  claim(workerId: string, limit: number, leaseSeconds: number): Promise<ActionOutboxRecord[]>
  complete(
    id: string,
    workerId: string,
    providerResponseId: string | null,
    providerResponse: Record<string, unknown>,
  ): Promise<ActionFinalizeResult>
  fail(
    id: string,
    workerId: string,
    failure: { code: string; message: string; retryAt: Date; deadLetter: boolean },
  ): Promise<ActionFinalizeResult>
  suppress(id: string, workerId: string, reason: string): Promise<ActionFinalizeResult>
  extendLease(id: string, workerId: string, leaseSeconds: number): Promise<boolean>
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

function clamped(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum
  return Math.min(Math.max(Math.trunc(value), minimum), maximum)
}

function requiredWorkerId(value: string): string {
  const workerId = value.trim()
  if (!workerId) throw new Error("workerId is required")
  return workerId
}

function safeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength)
}

export function toActionOutboxRecord(row: Record<string, unknown>): ActionOutboxRecord {
  return {
    id: stringValue(row.id),
    identity: {
      provider: "meta",
      providerEventKey: stringValue(row.provider_event_key),
      automationId: stringValue(row.automation_id),
      workflowVersionId: stringValue(row.workflow_version_id),
      nodeId: stringValue(row.node_id),
      actionType: stringValue(row.action_type),
      targetId: stringValue(row.target_id),
    },
    workspaceId: nullableString(row.workspace_id),
    socialAccountId: nullableString(row.social_account_id),
    payload: recordValue(row.action_payload),
    status: "claimed",
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 1,
    lockedBy: stringValue(row.locked_by),
    lockExpiresAt: stringValue(row.lock_expires_at),
  }
}

function finalizeResult(rows: Record<string, unknown>[]): ActionFinalizeResult {
  const status = nullableString(rows[0]?.status)
  return status ? { updated: true, status } : { updated: false, status: "lost_lease" }
}

export class PostgresActionOutboxRepository implements ActionOutboxRepository {
  constructor(private readonly database: PostgresQueryClient) {}

  async enqueue(requests: ProviderActionRequest[]): Promise<ActionOutboxEnqueueResult> {
    const total = requests.length
    if (total === 0) return { total: 0, inserted: 0, duplicates: 0 }

    // Collapse identities repeated inside one batch so the counts stay truthful.
    const seen = new Set<string>()
    const unique = requests.filter((request) => {
      const key = buildProviderActionIdentityKey(request.identity)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    let inserted = 0
    for (const request of unique) {
      const result = await this.database.query(ENQUEUE_ACTION_SQL, [
        request.identity.provider,
        request.identity.providerEventKey,
        request.identity.automationId,
        request.identity.workflowVersionId,
        request.identity.nodeId,
        request.identity.actionType,
        request.identity.targetId,
        request.workspaceId,
        request.socialAccountId,
        JSON.stringify(request.payload ?? {}),
      ])
      inserted += result.rowCount || 0
    }

    return { total, inserted, duplicates: total - inserted }
  }

  async claim(workerId: string, limit: number, leaseSeconds: number): Promise<ActionOutboxRecord[]> {
    const result = await this.database.query(CLAIM_ACTIONS_SQL, [
      requiredWorkerId(workerId),
      clamped(limit, 1, 50),
      clamped(leaseSeconds, 1, 3_600),
    ])
    return result.rows.map(toActionOutboxRecord)
  }

  async complete(
    id: string,
    workerId: string,
    providerResponseId: string | null,
    providerResponse: Record<string, unknown>,
  ): Promise<ActionFinalizeResult> {
    const result = await this.database.query(COMPLETE_ACTION_SQL, [
      id,
      requiredWorkerId(workerId),
      providerResponseId,
      JSON.stringify(providerResponse ?? {}),
    ])
    return finalizeResult(result.rows)
  }

  async fail(
    id: string,
    workerId: string,
    failure: { code: string; message: string; retryAt: Date; deadLetter: boolean },
  ): Promise<ActionFinalizeResult> {
    const result = await this.database.query(FAIL_ACTION_SQL, [
      id,
      requiredWorkerId(workerId),
      safeText(failure.code || "provider_error", 120),
      safeText(failure.message || "Provider action failed", 1_000),
      failure.retryAt.toISOString(),
      failure.deadLetter === true,
    ])
    return finalizeResult(result.rows)
  }

  async suppress(id: string, workerId: string, reason: string): Promise<ActionFinalizeResult> {
    const result = await this.database.query(SUPPRESS_ACTION_SQL, [
      id,
      requiredWorkerId(workerId),
      safeText(reason || "suppressed", 200),
    ])
    return finalizeResult(result.rows)
  }

  async extendLease(id: string, workerId: string, leaseSeconds: number): Promise<boolean> {
    const result = await this.database.query(EXTEND_ACTION_LEASE_SQL, [
      id,
      requiredWorkerId(workerId),
      clamped(leaseSeconds, 1, 3_600),
    ])
    return (result.rowCount || 0) > 0
  }
}
