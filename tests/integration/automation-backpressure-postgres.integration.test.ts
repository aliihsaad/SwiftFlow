import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

let admin: Pool
let db: Pool
const databaseName = `backpressure_test_${randomUUID().replaceAll('-', '')}`
const workspace = randomUUID(), account = randomUUID(), automation = randomUUID()
const sql = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8')

beforeAll(async () => {
  const url = new URL(process.env.SWIFTFLOW_TEST_DATABASE_URL || '')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.includes('test')) {
    throw new Error('This test requires a local test database')
  }
  admin = new Pool({ connectionString: url.toString() })
  await admin.query(`create database "${databaseName}"`)
  url.pathname = `/${databaseName}`
  db = new Pool({ connectionString: url.toString(), max: 12 })
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await admin.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`)
  }
  await db.query(readFileSync('tests/integration/postgres/000-base-schema.sql', 'utf8'))
  await db.query(`
    alter table automations add total_triggered integer default 0, add total_dms_sent integer default 0, add updated_at timestamptz;
    alter table automation_runs add event_id uuid, add node_results jsonb default '{}', add processed_count integer default 0,
      add dms_sent_count integer default 0, add error_count integer default 0, add error_message text, add finished_at timestamptz, add updated_at timestamptz;
    alter table automation_scheduled_executions add executed_at timestamptz;
  `)
  await db.query(sql('20260702100000_add_scheduled_execution_claim_locking'))
  await db.query(sql('20260731110000_add_waiting_automation_runs'))
  await db.query(sql('20260728120000_add_automation_runtime_guards'))
  await db.query(sql('20261016140000_automation_backpressure_reliability'))
  await db.query('insert into workspaces(id) values($1)', [workspace])
  await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'123456')", [account, workspace])
  await db.query('insert into automations(id,workspace_id,social_account_id) values($1,$2,$3)', [automation, workspace, account])
})

afterAll(async () => {
  await db?.end()
  if (admin) {
    await admin.query(`drop database if exists "${databaseName}"`)
    await admin.end()
  }
})

async function schedule(status = 'waiting') {
  const run = randomUUID(), execution = randomUUID()
  await db.query('insert into automation_runs(id,workspace_id,automation_id,status,pending_continuation_count) values($1,$2,$3,$4,1)', [run, workspace, automation, status])
  await db.query(`insert into automation_scheduled_executions(id,automation_id,execution_id,node_id,execution_context,scheduled_for)
    values($1,$2,$1,'dm',$3,now()-interval '1 minute')`, [execution, automation, JSON.stringify({ run_id: run })])
  return { run, execution }
}

describe('PostgreSQL automation backpressure', () => {
  it('atomically enforces the account budget across 1,000 concurrent reservations', async () => {
    const results = await Promise.all(Array.from({ length: 1000 }, () => db.query(
      "select * from reserve_automation_runtime_budget($1,$2,$3,'provider_send',60,60,3600,300)", [workspace, account, automation])))
    expect(results.filter(r => r.rows[0].allowed)).toHaveLength(60)
    expect(results.filter(r => !r.rows[0].allowed).every(r => r.rows[0].retry_after_seconds > 0)).toBe(true)
  })

  it('claims each due continuation once across competing schedulers and waits for the initial run to finalize', async () => {
    const entries = await Promise.all(Array.from({ length: 40 }, () => schedule()))
    const unfinished = await schedule('running')
    const claims = await Promise.all(Array.from({ length: 12 }, () => db.query('select * from claim_due_scheduled_executions($1,4,30)', [randomUUID()])))
    const ids = claims.flatMap(r => r.rows.map(row => row.id))
    expect(ids).toHaveLength(40)
    expect(new Set(ids).size).toBe(40)
    expect(ids).not.toContain(unfinished.execution)
    await db.query("update automation_scheduled_executions set status='completed' where id=any($1::uuid[])", [entries.map(e => e.execution)])
    await db.query("update automation_runs set status='waiting' where id=$1", [unfinished.run])
    const resumed = await db.query('select * from claim_due_scheduled_executions($1,4,30)', [randomUUID()])
    expect(resumed.rows.map(r => r.id)).toEqual([unfinished.execution])
    await db.query("update automation_scheduled_executions set status='completed' where id=$1", [unfinished.execution])
  })

  it('marks stale delivery leases for review instead of sending again', async () => {
    const item = await schedule()
    await db.query("update automation_scheduled_executions set status='executing',claim_token=$2,claimed_at=now()-interval '31 minutes' where id=$1", [item.execution, randomUUID()])
    const claims = await db.query('select * from claim_due_scheduled_executions($1,4,30)', [randomUUID()])
    expect(claims.rows).toHaveLength(0)
    const { rows } = await db.query('select status,error_message from automation_runs where id=$1', [item.run])
    expect(rows[0]).toMatchObject({ status: 'failed', error_message: expect.stringContaining('review required') })
  })

  it('keeps the run waiting on another deferral and completes it after the final send', async () => {
    const item = await schedule()
    const defer = await db.query("select * from apply_automation_run_continuation_result($1,'{}',0,0,0,1,null)", [item.run])
    expect(defer.rows[0]).toMatchObject({ status: 'waiting', remaining_continuations: 1, total_errors: 0 })
    const done = await db.query("select * from apply_automation_run_continuation_result($1,'{}',0,1,0,0,null)", [item.run])
    expect(done.rows[0]).toMatchObject({ status: 'completed', remaining_continuations: 0, total_errors: 0 })
  })

  it('increments statistics without lost updates and rejects another workspace', async () => {
    await Promise.all(Array.from({ length: 100 }, () => db.query('select increment_automation_stats($1,$2,1,1)', [workspace, automation])))
    await db.query('select increment_automation_stats($1,$2,99,99)', [randomUUID(), automation])
    const { rows } = await db.query('select total_triggered,total_dms_sent from automations where id=$1', [automation])
    expect(rows[0]).toEqual({ total_triggered: 100, total_dms_sent: 100 })
    const grants = await db.query("select has_function_privilege('authenticated','increment_automation_stats(uuid,uuid,integer,integer)','execute') as allowed")
    expect(grants.rows[0].allowed).toBe(false)
  })
})
