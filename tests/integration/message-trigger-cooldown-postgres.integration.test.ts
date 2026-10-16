import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

let admin: Pool, db: Pool
const databaseName = `message_cooldown_test_${randomUUID().replaceAll('-', '')}`
const workspace = randomUUID(), account = randomUUID(), campaign = randomUUID()

beforeAll(async () => {
  const url = new URL(process.env.SWIFTFLOW_TEST_DATABASE_URL || '')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.includes('test')) throw new Error('Local test database required')
  admin = new Pool({ connectionString: url.toString() })
  await admin.query(`create database "${databaseName}"`)
  url.pathname = `/${databaseName}`
  db = new Pool({ connectionString: url.toString(), max: 16 })
  for (const role of ['anon', 'authenticated', 'service_role']) await admin.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`)
  await db.query(readFileSync('tests/integration/postgres/000-base-schema.sql', 'utf8'))
  await db.query(`create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table workspace_members(workspace_id uuid,user_id uuid);
    create table automation_workflow_versions(id uuid primary key,automation_id uuid,workflow_graph jsonb);
    alter table automations add current_workflow_version_id uuid;
    alter table automation_runs add workflow_version_id uuid, add trigger_type text, add event_id uuid,
      add node_results jsonb not null default '{}', add processed_count integer not null default 0,
      add dms_sent_count integer not null default 0, add error_count integer not null default 0,
      add error_message text, add finished_at timestamptz, add updated_at timestamptz not null default now();`)
  const versions = readFileSync('supabase/migrations/20260728100000_add_immutable_automation_workflow_versions.sql', 'utf8')
  const pin = versions.match(/create or replace function public\.pin_automation_execution_workflow_version\(\)[\s\S]*?\$\$;/)?.[0]
  if (!pin) throw new Error('Production version-pinning trigger not found')
  await db.query(pin)
  await db.query('create trigger automation_runs_pin_workflow_version before insert on automation_runs for each row execute function pin_automation_execution_workflow_version()')
  const timeline = readFileSync('supabase/migrations/20260728110000_add_automation_execution_timeline.sql', 'utf8')
  await db.query(timeline.slice(0, timeline.indexOf('alter table public.automation_action_outbox')))
  await db.query(readFileSync('supabase/migrations/20261017090000_instagram_dm_recovery.sql', 'utf8'))
  await db.query(readFileSync('supabase/migrations/20261017100000_instagram_message_trigger_cooldown.sql', 'utf8'))
  await db.query('insert into workspaces(id) values($1)', [workspace])
  await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'123')", [account, workspace])
  await db.query('insert into automations(id,workspace_id,social_account_id) values($1,$2,$3)', [campaign, workspace, account])
})
afterAll(async () => { await db?.end(); if (admin) { await admin.query(`drop database if exists "${databaseName}"`); await admin.end() } })

async function automation(options: { cooldown?: number; follower?: boolean; workspaceId?: string; accountId?: string } = {}) {
  const id = randomUUID(), version = randomUUID()
  const graph = { nodes: [
    { id: 'message', data: { type: 'trigger_new_message', config: { recipient_cooldown_seconds: options.cooldown } } },
    ...(options.follower === false ? [] : [{ id: 'follow', data: { type: 'action_condition', config: { condition_type: 'instagram_follower_status' } } }]),
  ] }
  await db.query('insert into automations(id,workspace_id,social_account_id,workflow_graph,current_workflow_version_id) values($1,$2,$3,$4,$5)', [id, options.workspaceId || workspace, options.accountId || account, graph, version])
  await db.query('insert into automation_workflow_versions values($1,$2,$3)', [version, id, graph])
  return { id, version, graph, workspaceId: options.workspaceId || workspace }
}
type Automation = Awaited<ReturnType<typeof automation>>
async function insert(a: Automation, sender: string, options: { messageId?: string; kind?: string; trigger?: string } = {}) {
  return (await db.query(`insert into automation_runs(workspace_id,automation_id,trigger_type,trigger_context) values($1,$2,$3,$4)
    returning id,status,node_results,workflow_version_id,error_count,dms_sent_count`, [a.workspaceId, a.id, options.trigger || 'trigger_new_message',
    { sender_id: sender, message_id: options.messageId || randomUUID(), message_kind: options.kind || 'postback', message_text: 'I Followed' }])).rows[0]
}
async function finish(id: string, ageSeconds = 0, status = 'completed') {
  await db.query('update automation_runs set status=$2,created_at=now()-make_interval(secs=>$3) where id=$1', [id, status, ageSeconds])
}

describe('atomic recipient message admission', () => {
  it('admits one of 50 simultaneous taps and records the rest as suppressed, not failed', async () => {
    const a = await automation()
    const rows = await Promise.all(Array.from({ length: 50 }, () => insert(a, 'burst')))
    expect(rows.filter(r => r.status === 'queued')).toHaveLength(1)
    expect(rows.filter(r => r.status === 'skipped')).toHaveLength(49)
    expect(rows.every(r => r.error_count === 0 && r.dms_sent_count === 0 && r.workflow_version_id === a.version)).toBe(true)
    const events = await db.query("select * from automation_execution_events where automation_id=$1 and event_type='suppressed'", [a.id])
    expect(events.rowCount).toBe(49)
    expect(events.rows.every(e => !JSON.stringify(e.output_redacted).includes('burst'))).toBe(true)
    // The existing worker's queued-only claim cannot run any suppressed row.
    const claimed = await db.query("update automation_runs set status='running' where automation_id=$1 and status='queued' returning id", [a.id])
    expect(claimed.rowCount).toBe(1)
  })
  it('shares cooldown across typed messages and postbacks without extending it for suppressed taps', async () => {
    const a = await automation(), first = await insert(a, 'repeat')
    await finish(first.id, 45)
    const repeat = await insert(a, 'repeat', { kind: 'message' })
    expect(repeat.node_results._message_trigger_guard.output).toMatchObject({ reason: 'recipient_cooldown' })
    expect(repeat.node_results._message_trigger_guard.output.retry_after_seconds).toBeLessThanOrEqual(15)
    await finish(first.id, 61)
    expect((await insert(a, 'repeat')).status).toBe('queued')
  })
  it.each(['queued', 'running', 'waiting'])('blocks new runs while a %s run exists, even beyond cooldown', async status => {
    const a = await automation(), first = await insert(a, 'active')
    await finish(first.id, 120, status)
    expect((await insert(a, 'active')).node_results._message_trigger_guard.output.reason).toBe('recipient_in_flight')
    // Updating/resuming the existing run is not admission and remains possible.
    await finish(first.id, 120, 'completed')
    expect((await insert(a, 'active')).status).toBe('queued')
  })
  it('does not admit an old webhook replay after the cooldown', async () => {
    const a = await automation(), first = await insert(a, 'replay', { messageId: 'same-message' })
    await finish(first.id, 120)
    expect((await insert(a, 'replay', { messageId: 'same-message' })).node_results._message_trigger_guard.output.reason).toBe('duplicate_message')
    expect((await insert(a, 'replay')).status).toBe('queued')
  })
  it('isolates people and campaigns', async () => {
    const a = await automation(), b = await automation()
    expect((await insert(a, 'one')).status).toBe('queued')
    expect((await insert(a, 'two')).status).toBe('queued')
    expect((await insert(b, 'one')).status).toBe('queued')
  })
  it('isolates accounts and workspaces for the same sender value', async () => {
    const otherWorkspace = randomUUID(), otherAccount = randomUUID()
    await db.query('insert into workspaces(id) values($1)', [otherWorkspace])
    await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'456')", [otherAccount, otherWorkspace])
    const a = await automation(), b = await automation({ workspaceId: otherWorkspace, accountId: otherAccount })
    expect((await insert(a, 'same')).status).toBe('queued')
    expect((await insert(b, 'same')).status).toBe('queued')
  })
  it('keeps ordinary message workflows and comment triggers unchanged', async () => {
    const ordinary = await automation({ follower: false }), comment = await automation()
    expect((await insert(ordinary, 'conversation')).status).toBe('queued')
    expect((await insert(ordinary, 'conversation')).status).toBe('queued')
    expect((await insert(comment, 'commenter', { trigger: 'trigger_new_comment' })).status).toBe('queued')
    expect((await insert(comment, 'commenter', { trigger: 'trigger_new_comment' })).status).toBe('queued')
  })
  it('preserves account isolation after worker completion replaces node results', async () => {
    const a = await automation(), first = await insert(a, 'reconnected')
    await db.query("update automation_runs set status='completed',node_results='{}' where id=$1", [first.id])
    const otherAccount = randomUUID()
    await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'789')", [otherAccount, workspace])
    await db.query('update automations set social_account_id=$2 where id=$1', [a.id, otherAccount])
    expect((await insert(a, 'reconnected')).status).toBe('queued')
  })
  it('supports explicit opt-out and custom cooldown on ordinary DM flows', async () => {
    const off = await automation({ cooldown: 0 }), custom = await automation({ cooldown: 120, follower: false })
    await insert(off, 'disabled')
    expect((await insert(off, 'disabled')).status).toBe('queued')
    const first = await insert(custom, 'custom')
    await finish(first.id, 61)
    expect((await insert(custom, 'custom')).status).toBe('skipped')
    await finish(first.id, 121)
    expect((await insert(custom, 'custom')).status).toBe('queued')
  })
  it('evaluates the pinned version even after the editor graph changes', async () => {
    const a = await automation()
    await db.query("update automations set workflow_graph='{}' where id=$1", [a.id])
    await insert(a, 'pinned')
    expect((await insert(a, 'pinned')).status).toBe('skipped')
  })
  it('does not consume admission when the inserting transaction rolls back', async () => {
    const a = await automation(), client = await db.connect()
    try {
      await client.query('begin')
      await client.query("insert into automation_runs(workspace_id,automation_id,trigger_type,trigger_context) values($1,$2,'trigger_new_message',$3)", [workspace, a.id, { sender_id: 'rollback', message_id: 'rolled-back' }])
      await client.query('rollback')
    } finally { client.release() }
    expect((await insert(a, 'rollback', { messageId: 'rolled-back' })).status).toBe('queued')
  })
  it('shares normal/recovery limits and persists suppressed recovery receipts', async () => {
    const a = await automation(), normal = await insert(a, 'recovering')
    await finish(normal.id)
    const origin = (await db.query('insert into automation_runs(workspace_id,automation_id) values($1,$2) returning id', [workspace, campaign])).rows[0].id
    await db.query(`insert into instagram_dm_recoveries(workspace_id,social_account_id,campaign_id,comment_id,recipient_id,keyword,verification_automation_id,workflow_version_id,origin_run_id,node_id,reply_text,meta_error,expires_at)
      values($1,$2,$3,'comment','recovering','windock',$4,$5,$6,'private','DM WinDock','{}',now()+interval '1 hour')`, [workspace, account, campaign, a.id, a.version, origin])
    const consume = async (message: string) => (await db.query("select consume_instagram_recovery($1,$2,'recovering','WinDock',$3) as result", [workspace, account, message])).rows[0].result
    const limited = await consume('recovery-message')
    expect(limited.reason).toBe('recipient_cooldown')
    await finish(normal.id, 61)
    expect(await consume('recovery-message')).toMatchObject({ ...limited, duplicate: true })
    const allowed = await consume('new-recovery-message')
    expect(allowed.reason).toBe('queued')
    expect((await insert(a, 'recovering')).node_results._message_trigger_guard.output.reason).toBe('recipient_in_flight')
  })
  it('does not grant authenticated clients new admission privileges', async () => {
    const result = await db.query("select has_function_privilege('authenticated','public.instagram_message_trigger_cooldown(jsonb)','execute') as allowed")
    expect(result.rows[0].allowed).toBe(false)
  })
})
