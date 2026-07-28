import type { Pool, PoolClient } from "pg"

import type { PostgresQueryClient } from "../webhooks/postgres-inbox-repository"

/**
 * Fixed key for the executor's single-replica advisory lock. Arbitrary but
 * stable; it only has to be unique within this database.
 */
export const ACTION_EXECUTOR_ADVISORY_LOCK_KEY = 8_471_2026

export interface SingleReplicaLock {
  release(): Promise<void>
}

/**
 * Enforces that exactly one executor is running.
 *
 * `deploy.replicas` is advisory in plain Docker Compose and is silently
 * overridden by `--scale`, so it cannot be trusted as the guarantee. A
 * session-scoped PostgreSQL advisory lock is held by the live connection for
 * the process lifetime instead: a second instance cannot acquire it and refuses
 * to start. The lock is released automatically if the process dies, so a crash
 * does not wedge the deployment.
 *
 * This protects the per-process rate limiter only. Send-once is guaranteed
 * independently by the outbox identity and the transactional claim.
 */
export async function acquireSingleReplicaLock(pool: Pool): Promise<SingleReplicaLock> {
  const client: PoolClient = await pool.connect()

  try {
    const result = await client.query<{ locked: boolean }>(
      "select pg_try_advisory_lock($1) as locked",
      [ACTION_EXECUTOR_ADVISORY_LOCK_KEY],
    )

    if (result.rows[0]?.locked !== true) {
      throw new Error(
        "Another action executor instance already holds the single-replica lock. "
        + "The in-process rate limiter is only correct at one replica; refusing to start.",
      )
    }
  } catch (error) {
    client.release()
    throw error
  }

  return {
    async release() {
      try {
        await client.query("select pg_advisory_unlock($1)", [
          ACTION_EXECUTOR_ADVISORY_LOCK_KEY,
        ])
      } finally {
        client.release()
      }
    },
  }
}

/** Reports how many sessions currently hold the executor lock. */
export async function countActionExecutorInstances(
  database: PostgresQueryClient,
): Promise<number> {
  const result = await database.query(
    `select count(*)::int as holders
     from pg_locks
     where locktype = 'advisory' and objid = $1 and granted`,
    [ACTION_EXECUTOR_ADVISORY_LOCK_KEY],
  )
  return Number(result.rows[0]?.holders ?? 0)
}

const READINESS_SQL = `
  select
    to_regclass('public.automation_action_outbox')::text as outbox_table,
    to_regprocedure(
      'public.claim_automation_actions(text,integer,integer)'
    )::text as claim_function
`

const ACCESS_SQL = `
  select
    role.rolsuper,
    role.rolcreatedb,
    role.rolcreaterole,
    role.rolreplication,
    role.rolbypassrls,
    has_schema_privilege(current_user, 'public', 'usage') as schema_usage,
    has_schema_privilege(current_user, 'public', 'create') as schema_create,
    has_table_privilege(current_user, 'public.automation_action_outbox', 'select') as outbox_select,
    has_column_privilege(current_user, 'public.automation_action_outbox', 'status', 'update') as outbox_status_update,
    has_function_privilege(
      current_user,
      'public.claim_automation_actions(text,integer,integer)',
      'execute'
    ) as claim_execute,
    has_column_privilege(current_user, 'public.social_accounts', 'access_token', 'select') as token_select,
    has_table_privilege(current_user, 'public.automation_action_outbox', 'insert') as outbox_insert,
    has_table_privilege(current_user, 'public.automation_action_outbox', 'delete') as outbox_delete,
    has_table_privilege(current_user, 'public.automation_action_outbox', 'truncate') as outbox_truncate,
    has_column_privilege(current_user, 'public.social_accounts', 'refresh_token', 'select') as refresh_token_select,
    has_table_privilege(current_user, 'public.webhook_inbox_events', 'select') as inbox_select,
    has_table_privilege(current_user, 'public.workspaces', 'select') as workspaces_select
  from pg_roles as role
  where role.rolname = current_user
`

const REQUIRED_ACCESS = [
  "schema_usage",
  "outbox_select",
  "outbox_status_update",
  "claim_execute",
  "token_select",
] as const

const FORBIDDEN_ACCESS = [
  "rolsuper",
  "rolcreatedb",
  "rolcreaterole",
  "rolreplication",
  "rolbypassrls",
  "schema_create",
  "outbox_insert",
  "outbox_delete",
  "outbox_truncate",
  "refresh_token_select",
  "inbox_select",
  "workspaces_select",
] as const

export async function assertActionExecutorDatabaseReady(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(READINESS_SQL)
  const row = result.rows[0]
  if (!row?.outbox_table || !row?.claim_function) {
    throw new Error(
      "Action outbox schema is not ready; apply the action outbox migration before starting the executor",
    )
  }
}

export async function assertActionExecutorDatabaseAccess(
  database: PostgresQueryClient,
): Promise<void> {
  const result = await database.query(ACCESS_SQL)
  const row = result.rows[0] || {}
  const missing = REQUIRED_ACCESS.filter((name) => row[name] !== true)
  const forbidden = FORBIDDEN_ACCESS.filter((name) => row[name] === true)

  if (missing.length > 0 || forbidden.length > 0) {
    const details = [
      missing.length > 0 ? `missing ${missing.join(", ")}` : "",
      forbidden.length > 0 ? `forbidden ${forbidden.join(", ")}` : "",
    ].filter(Boolean).join("; ")
    throw new Error(`Action executor database role is not least-privilege: ${details}`)
  }
}
