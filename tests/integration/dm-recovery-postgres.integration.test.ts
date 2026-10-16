import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

let admin: Pool, db: Pool
const databaseName = `recovery_test_${randomUUID().replaceAll('-', '')}`
const workspace = randomUUID(), account = randomUUID(), campaign = randomUUID(), target = randomUUID(), version = randomUUID(), origin = randomUUID()
beforeAll(async () => {
  const url = new URL(process.env.SWIFTFLOW_TEST_DATABASE_URL || '')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.includes('test')) throw new Error('Local test database required')
  admin = new Pool({ connectionString: url.toString() })
  await admin.query(`create database "${databaseName}"`)
  url.pathname = `/${databaseName}`
  db = new Pool({ connectionString: url.toString(), max: 12 })
  for (const role of ['anon', 'authenticated', 'service_role']) await admin.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`)
  await db.query(readFileSync('tests/integration/postgres/000-base-schema.sql', 'utf8'))
  await db.query(`create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table workspace_members(workspace_id uuid,user_id uuid);
    create table automation_workflow_versions(id uuid primary key,automation_id uuid,workflow_graph jsonb);
    alter table automations add current_workflow_version_id uuid;
    alter table automation_runs add workflow_version_id uuid, add trigger_type text;
  `)
  // Exact production timeline DDL (its later outbox grants are unrelated).
  const timeline = readFileSync('supabase/migrations/20260728110000_add_automation_execution_timeline.sql', 'utf8')
  await db.query(timeline.slice(0, timeline.indexOf('alter table public.automation_action_outbox')))
  await db.query(readFileSync('supabase/migrations/20261017090000_instagram_dm_recovery.sql', 'utf8'))
  await db.query('insert into workspaces(id) values($1)', [workspace])
  await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'123')", [account, workspace])
  await db.query('insert into automations(id,workspace_id,social_account_id) values($1,$3,$4),($2,$3,$4)', [campaign, target, workspace, account])
  await db.query('insert into automation_workflow_versions values($1,$2,$3)', [version, target, JSON.stringify({ nodes: [] })])
  await db.query('insert into automation_runs(id,workspace_id,automation_id) values($1,$2,$3)', [origin, workspace, campaign])
})
afterAll(async () => { await db?.end(); if (admin) { await admin.query(`drop database if exists "${databaseName}"`); await admin.end() } })

async function recovery(recipient: string, options: { campaignId?: string; expired?: boolean; comment?: string; keyword?: string } = {}) {
  const { rows } = await db.query(`insert into instagram_dm_recoveries(workspace_id,social_account_id,campaign_id,comment_id,recipient_id,keyword,verification_automation_id,workflow_version_id,origin_run_id,node_id,reply_text,meta_error,expires_at)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,'private','Send WinDock in a DM','{}',now()+$10::interval) returning id`,
  [workspace, account, options.campaignId || campaign, options.comment || randomUUID(), recipient, options.keyword || 'windock', target, version, origin, options.expired ? '-1 hour' : '72 hours'])
  return rows[0].id as string
}
async function consume(recipient: string, keyword = 'WinDock', message = randomUUID(), accountId = account) {
  return (await db.query('select consume_instagram_recovery($1,$2,$3,$4,$5) as result', [workspace, accountId, recipient, keyword.trim().toLowerCase(), message])).rows[0].result
}
async function claim(kind: string, subject: string) {
  return (await db.query('select claim_instagram_campaign_delivery($1,$2,$3,$4,$5) as result', [workspace, account, campaign, kind, subject])).rows[0].result
}
async function finish(kind: string, subject: string, token: string, status = 'sent') {
  return (await db.query('select finish_instagram_campaign_delivery($1,$2,$3,$4,$5,$6,$7,$8) as result', [workspace, account, campaign, kind, subject, token, status, status === 'sent' ? 'provider-id' : null])).rows[0].result
}

describe('PostgreSQL recovery atomicity and scoped routing', () => {
  it('allows exactly one fallback claim under a burst of 100 workers', async () => {
    const results = await Promise.all(Array.from({ length: 100 }, () => claim('fallback', 'same-comment')))
    expect(results.filter(r => r.claimed)).toHaveLength(1)
    const token = results.find(r => r.claimed).claim_token
    expect(await finish('fallback', 'same-comment', token)).toBe(true)
    expect(await claim('fallback', 'same-comment')).toMatchObject({ claimed: false, status: 'sent' })
  })
  it('does not reclaim a crash between provider send and persistence', async () => {
    await claim('resource', 'crashed-recipient')
    await db.query("update instagram_campaign_deliveries set updated_at=now()-interval '30 days' where subject_id='crashed-recipient'")
    expect(await claim('resource', 'crashed-recipient')).toMatchObject({ claimed: false, status: 'sending' })
  })
  it('queues the correct pinned verifier once across duplicate webhooks', async () => {
    const id = await recovery('recipient-1'), mid = randomUUID()
    const results = await Promise.all(Array.from({ length: 25 }, () => consume('recipient-1', '  WINDOCK ', mid)))
    expect(new Set(results.map(r => r.run_id)).size).toBe(1)
    const run = (await db.query('select * from automation_runs where id=$1', [results[0].run_id])).rows[0]
    expect(run).toMatchObject({ status: 'queued', automation_id: target, workflow_version_id: version, trigger_context: { sender_id: 'recipient-1', recovery_id: id, recovery_campaign_id: campaign } })
    expect((await consume('recipient-1')).reason).toBe('in_flight')
  })
  it('wrong keyword, another recipient or another account cannot consume recovery', async () => {
    await recovery('recipient-2')
    expect(await consume('recipient-2', 'windock please')).toEqual({ handled: false })
    expect(await consume('recipient-other')).toEqual({ handled: false })
    expect(await consume('recipient-2', 'windock', randomUUID(), randomUUID())).toEqual({ handled: false })
  })
  it('a keyword sent before a recovery exists cannot retroactively activate it on replay', async () => {
    const mid = randomUUID()
    expect(await consume('early', 'windock', mid)).toEqual({ handled: false })
    await recovery('early')
    expect(await consume('early', 'windock', mid)).toMatchObject({ handled: false, duplicate: true })
    expect((await consume('early')).reason).toBe('queued')
  })
  it('seeds historical resource delivery before a newly opted-in journey can send again', async () => {
    await db.query('update automations set workflow_graph=$2 where id=$1', [target, JSON.stringify({ nodes: [{ id: 'historical-resource', data: { config: { resource_campaign_id: campaign } } }] })])
    await db.query(`insert into automation_execution_events(event_key,workspace_id,automation_id,source,event_type,node_id,node_type,input_redacted,output_redacted)
      values('historical',$1,$2,'graph','succeeded','historical-resource','action_send_dm',$3,$4)`, [workspace, target, JSON.stringify({ context: { sender_id: 'historical-user' } }), JSON.stringify({ channel: 'dm', messageId: 'old-message' })])
    expect(await claim('resource', 'historical-user')).toMatchObject({ claimed: false, status: 'sent' })
  })
  it('same keyword across two campaigns is ambiguous and enqueues neither', async () => {
    const other = randomUUID()
    await db.query('insert into automations(id,workspace_id,social_account_id) values($1,$2,$3)', [other, workspace, account])
    await recovery('ambiguous')
    await recovery('ambiguous', { campaignId: other })
    expect(await consume('ambiguous')).toEqual({ handled: true, reason: 'ambiguous' })
    expect((await db.query("select count(*)::int as n from automation_runs where trigger_context->>'sender_id'='ambiguous'")).rows[0].n).toBe(0)
  })
  it('uses the only unexpired campaign and treats repeated expired messages deterministically', async () => {
    const expired = await recovery('expired', { expired: true })
    expect(await consume('expired')).toEqual({ handled: true, reason: 'expired' })
    expect(await consume('expired')).toEqual({ handled: true, reason: 'expired' })
    const events = await db.query("select count(*)::int as n from automation_execution_events where event_type='recovery_expired' and output_redacted->>'recovery_id'=$1", [expired])
    expect(events.rows[0].n).toBe(1)
  })
  it('after not-following completion, a new inbound keyword can check again, but replaying the old message cannot', async () => {
    await recovery('not-following')
    const mid = randomUUID(), first = await consume('not-following', 'windock', mid)
    await db.query("update automation_runs set status='completed' where id=$1", [first.run_id])
    expect((await consume('not-following', 'windock', mid)).run_id).toBe(first.run_id)
    expect((await consume('not-following')).run_id).not.toBe(first.run_id)
  })
  it('normal confirmation and recovery share one atomic resource reservation', async () => {
    const id = await recovery('delivered')
    const results = await Promise.all(Array.from({ length: 50 }, () => claim('resource', 'delivered')))
    expect(results.filter(r => r.claimed)).toHaveLength(1)
    await finish('resource', 'delivered', results.find(r => r.claimed).claim_token)
    expect(await consume('delivered')).toEqual({ handled: true, reason: 'completed' })
    expect((await db.query('select status from instagram_dm_recoveries where id=$1', [id])).rows[0].status).toBe('completed')
    expect((await db.query("select count(*)::int as n from automation_execution_events where event_type='recovery_completed' and output_redacted->>'recovery_id'=$1", [id])).rows[0].n).toBe(1)
  })
  it('a definite rate rejection can be queued again, whereas rejected/unknown sends stay blocked', async () => {
    const first = await claim('fallback', 'rate')
    await finish('fallback', 'rate', first.claim_token, 'retryable')
    expect((await claim('fallback', 'rate')).claimed).toBe(true)
    for (const state of ['failed', 'unknown']) {
      const reservation = await claim('fallback', state)
      await finish('fallback', state, reservation.claim_token, state)
      expect(await claim('fallback', state)).toMatchObject({ claimed: false, status: state })
    }
  })
  it('keeps service-only mutation RPCs inaccessible to ordinary users', async () => {
    const { rows } = await db.query("select has_function_privilege('authenticated','consume_instagram_recovery(uuid,uuid,text,text,text)','execute') as allowed")
    expect(rows[0].allowed).toBe(false)
    await expect(db.query("select claim_instagram_campaign_delivery($1,$2,$3,'resource','cross-workspace')", [randomUUID(), account, campaign])).rejects.toThrow('Invalid campaign scope')
  })
  it('expires pending records in bounded maintenance batches', async () => {
    const id = await recovery('swept', { expired: true })
    await db.query('select expire_instagram_recoveries()')
    expect((await db.query('select status from instagram_dm_recoveries where id=$1', [id])).rows[0].status).toBe('expired')
  })
})
