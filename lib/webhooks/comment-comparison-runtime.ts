import { hostname } from "node:os"

import type { WebhookInboxWorkerOptions } from "./inbox-worker"
import type { PostgresQueryClient } from "./postgres-inbox-repository"

export interface CommentComparisonRuntimeEnvironment
  extends Readonly<Record<string, string | undefined>> {
  WEBHOOK_COMPARISON_WORKER_ID?: string
  WEBHOOK_COMPARISON_BATCH_SIZE?: string
  WEBHOOK_COMPARISON_LEASE_SECONDS?: string
  WEBHOOK_COMPARISON_POLL_INTERVAL_MS?: string
  WEBHOOK_COMPARISON_RETRY_BASE_MS?: string
  WEBHOOK_COMPARISON_RETRY_MAX_MS?: string
  WEBHOOK_COMPARISON_RUN_ONCE?: string
  WEBHOOK_COMPARISON_ENQUEUE_ACTIONS?: string
}

export interface CommentComparisonWorkerConfig
  extends Required<Omit<WebhookInboxWorkerOptions, "now">> {
  pollIntervalMs: number
  runOnce: boolean
  /** Append intended provider actions to the outbox. Never sends anything. */
  enqueueActions: boolean
}

export interface WorkerRuntimeIdentity {
  hostname: string
  pid: number
}

const DATABASE_READINESS_SQL = `
  select
    to_regclass('public.webhook_inbox_events')::text as inbox_table,
    to_regprocedure(
      'public.claim_webhook_inbox_events(text,integer,integer)'
    )::text as claim_function
`

const DATABASE_ACCESS_SQL = `
  select
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolreplication,
    role.rolbypassrls,
    has_schema_privilege(current_user, 'public', 'usage') as schema_usage,
    has_schema_privilege(current_user, 'public', 'create') as schema_create,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'select'
    ) as inbox_select,
    (
      select bool_and(has_column_privilege(
        current_user,
        'public.webhook_inbox_events',
        required.column_name,
        'update'
      ))
      from unnest(array[
        'status',
        'workspace_id',
        'social_account_id',
        'result',
        'attempt_count',
        'available_at',
        'locked_at',
        'lock_expires_at',
        'locked_by',
        'last_error_code',
        'last_error_message',
        'processed_at',
        'updated_at'
      ]) as required(column_name)
    ) as inbox_required_updates,
    (
      select bool_and(has_column_privilege(
        current_user,
        'public.social_accounts',
        required.column_name,
        'select'
      ))
      from unnest(array[
        'id',
        'workspace_id',
        'account_id',
        'metadata'
      ]) as required(column_name)
    ) as social_accounts_required_selects,
    (
      select bool_and(has_column_privilege(
        current_user,
        'public.automations',
        required.column_name,
        'select'
      ))
      from unnest(array[
        'id',
        'workspace_id',
        'social_account_id',
        'is_active',
        'editor_version',
        'workflow_graph',
        'created_at'
      ]) as required(column_name)
    ) as automations_required_selects,
    has_function_privilege(
      current_user,
      'public.claim_webhook_inbox_events(text,integer,integer)',
      'execute'
    ) as claim_execute,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'insert'
    ) as inbox_insert,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'delete'
    ) as inbox_delete,
    has_table_privilege(
      current_user,
      'public.webhook_inbox_events',
      'truncate'
    ) as inbox_truncate,
    has_column_privilege(
      current_user,
      'public.webhook_inbox_events',
      'payload',
      'update'
    ) as payload_update,
    (
      has_column_privilege(
        current_user,
        'public.social_accounts',
        'access_token',
        'select'
      )
      or has_column_privilege(
        current_user,
        'public.social_accounts',
        'refresh_token',
        'select'
      )
    ) as social_account_token_select,
    has_table_privilege(
      current_user,
      'public.workspaces',
      'select'
    ) as workspaces_select
  from pg_roles as role
  where role.rolname = current_user
`

const REQUIRED_DATABASE_ACCESS = [
  "schema_usage",
  "inbox_select",
  "inbox_required_updates",
  "social_accounts_required_selects",
  "automations_required_selects",
  "claim_execute",
] as const

const FORBIDDEN_DATABASE_ACCESS = [
  "rolsuper",
  "rolcreatedb",
  "rolcreaterole",
  "rolreplication",
  "rolbypassrls",
  "schema_create",
  "inbox_insert",
  "inbox_delete",
  "inbox_truncate",
  "payload_update",
  "social_account_token_select",
  "workspaces_select",
] as const

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

function defaultWorkerId(identity: WorkerRuntimeIdentity): string {
  const host = identity.hostname.trim() || "unknown-host"
  return `${host}-${identity.pid}`.slice(0, 120)
}

function booleanValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return normalized === "true" || normalized === "1"
}

export function resolveCommentComparisonWorkerConfig(
  environment: CommentComparisonRuntimeEnvironment = process.env,
  identity: WorkerRuntimeIdentity = {
    hostname: hostname(),
    pid: process.pid,
  },
): CommentComparisonWorkerConfig {
  const retryBaseMs = boundedInteger(
    environment.WEBHOOK_COMPARISON_RETRY_BASE_MS,
    5_000,
    100,
    60 * 60_000,
  )
  const retryMaxMs = boundedInteger(
    environment.WEBHOOK_COMPARISON_RETRY_MAX_MS,
    15 * 60_000,
    retryBaseMs,
    24 * 60 * 60_000,
  )

  return {
    workerId:
      environment.WEBHOOK_COMPARISON_WORKER_ID?.trim().slice(0, 120)
      || defaultWorkerId(identity),
    batchSize: boundedInteger(
      environment.WEBHOOK_COMPARISON_BATCH_SIZE,
      10,
      1,
      100,
    ),
    leaseSeconds: boundedInteger(
      environment.WEBHOOK_COMPARISON_LEASE_SECONDS,
      60,
      5,
      3_600,
    ),
    pollIntervalMs: boundedInteger(
      environment.WEBHOOK_COMPARISON_POLL_INTERVAL_MS,
      1_000,
      50,
      60_000,
    ),
    retryBaseMs,
    runOnce: booleanValue(environment.WEBHOOK_COMPARISON_RUN_ONCE),
    enqueueActions: booleanValue(environment.WEBHOOK_COMPARISON_ENQUEUE_ACTIONS),
    retryMaxMs,
  }
}

export async function assertCommentComparisonDatabaseReady(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(DATABASE_READINESS_SQL)
  const row = result.rows[0]
  if (!row?.inbox_table || !row?.claim_function) {
    throw new Error(
      "Webhook inbox schema is not ready; apply the durable inbox migration before starting the worker",
    )
  }
}

export async function assertCommentComparisonDatabaseAccess(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(DATABASE_ACCESS_SQL)
  const row = result.rows[0] || {}
  const missing = REQUIRED_DATABASE_ACCESS.filter((name) => row[name] !== true)
  const forbidden = FORBIDDEN_DATABASE_ACCESS.filter((name) => row[name] === true)

  if (missing.length > 0 || forbidden.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      forbidden.length > 0 ? `forbidden ${forbidden.join(", ")}` : "",
    ].filter(Boolean).join("; ")
    throw new Error(
      `Webhook comparison database role is not least-privilege: ${details}`,
    )
  }
}
