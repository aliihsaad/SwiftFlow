import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'
import { beforeAll, afterAll, describe, it, expect } from 'vitest'

let admin: Pool, db: Pool
const databaseName = `pacing_test_${randomUUID().replaceAll('-', '')}`
beforeAll(async () => {
  const url = new URL(process.env.SWIFTFLOW_TEST_DATABASE_URL || '')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.pathname.includes('test')) throw new Error('Local test database required')
  admin = new Pool({ connectionString: url.toString() })
  await admin.query(`create database "${databaseName}"`)
  url.pathname = `/${databaseName}`
  db = new Pool({ connectionString: url.toString(), max: 20 })
  for (const role of ['anon', 'authenticated', 'service_role']) await admin.query(`do $$ begin if not exists(select 1 from pg_roles where rolname='${role}') then create role ${role}; end if; end $$`)
  await db.query(readFileSync('tests/integration/postgres/000-base-schema.sql', 'utf8'))
  await db.query(readFileSync('supabase/migrations/20260728120000_add_automation_runtime_guards.sql', 'utf8'))
  await db.query(readFileSync('supabase/migrations/20261018170000_smooth_provider_send_budget.sql', 'utf8'))
})
afterAll(async () => { await db?.end(); if (admin) { await admin.query(`drop database if exists "${databaseName}"`); await admin.end() } })

async function fixture() {
  const workspace = randomUUID(), account = randomUUID(), automation = randomUUID(), other = randomUUID()
  await db.query('insert into workspaces(id) values($1)', [workspace])
  await db.query("insert into social_accounts(id,workspace_id,account_id) values($1,$2,'fixture')", [account, workspace])
  await db.query('insert into automations(id,workspace_id,social_account_id) values($1,$3,$4),($2,$3,$4)', [automation, other, workspace, account])
  return { workspace, account, automation, other }
}
async function reserve(scope: Awaited<ReturnType<typeof fixture>>, options: { automation?: string; resource?: string; accountLimit?: number; automationLimit?: number } = {}) {
  return (await db.query('select * from reserve_automation_runtime_budget($1,$2,$3,$4,$5,$6,3600,300)', [
    scope.workspace, scope.account, options.automation || scope.automation, options.resource || 'provider_send', options.accountLimit || 60, options.automationLimit || 60,
  ])).rows[0]
}
describe('distributed provider pacing', () => {
  it('allows only the configured capacity under 100 concurrent workers sharing an account', async () => {
    const scope = await fixture()
    const result = await Promise.all(Array.from({ length: 100 }, (_, index) => reserve(scope, { automation: index % 2 ? scope.automation : scope.other })))
    expect(result.filter(r => r.allowed)).toHaveLength(60)
    expect(result.filter(r => !r.allowed).every(r => r.reason === 'account_budget_exhausted' && r.retry_after_seconds <= 60)).toBe(true)
    const rows = (await db.query('select available_tokens::float8 as tokens from automation_provider_send_tokens where workspace_id=$1', [scope.workspace])).rows
    expect(rows.every(r => r.tokens >= 0 && r.tokens < 60)).toBe(true)
  })
  it('carries over exhausted fixed-window usage instead of granting a fresh rollout burst', async () => {
    const scope = await fixture()
    await db.query(`insert into automation_runtime_budget_buckets(workspace_id,scope_kind,scope_id,resource_kind,window_started_at,window_seconds,used_units)
      values($1,'account',$2,'provider_send',to_timestamp(floor(extract(epoch from clock_timestamp())/3600)*3600),3600,60)`, [scope.workspace, scope.account])
    expect(await reserve(scope)).toMatchObject({ allowed: false, reason: 'account_budget_exhausted', retry_after_seconds: 60 })
  })
  it('refills a send after one minute without waiting for an hourly boundary or overfilling after idle time', async () => {
    const scope = await fixture()
    await reserve(scope)
    await db.query("update automation_provider_send_tokens set available_tokens=0,refilled_at=clock_timestamp()-interval '61 seconds' where workspace_id=$1", [scope.workspace])
    expect(await reserve(scope)).toMatchObject({ allowed: true, account_remaining: 0 })
    expect(await reserve(scope)).toMatchObject({ allowed: false, reason: 'account_budget_exhausted' })
    await db.query("update automation_provider_send_tokens set refilled_at=clock_timestamp()-interval '1 day' where workspace_id=$1", [scope.workspace])
    expect(await reserve(scope)).toMatchObject({ allowed: true, account_remaining: 59, automation_remaining: 59 })
  })
  it('checks automation allowance atomically without charging the account for denied work', async () => {
    const scope = await fixture()
    expect(await reserve(scope, { automationLimit: 1 })).toMatchObject({ allowed: true })
    expect(await reserve(scope, { automationLimit: 1 })).toMatchObject({ allowed: false, reason: 'automation_budget_exhausted', account_remaining: 59 })
    expect(await reserve(scope, { automation: scope.other })).toMatchObject({ allowed: true, account_remaining: 58 })
  })
  it('retains circuit-open rejection and exactly one half-open probe without charging denied sends', async () => {
    const scope = await fixture()
    await reserve(scope)
    await db.query("update automation_runtime_circuits set circuit_state='open',retry_at=clock_timestamp()+interval '5 minutes' where workspace_id=$1 and scope_kind='account'", [scope.workspace])
    expect(await reserve(scope)).toMatchObject({ allowed: false, reason: 'account_circuit_open', account_remaining: 59 })
    await db.query("update automation_runtime_circuits set retry_at=clock_timestamp()-interval '1 second' where workspace_id=$1 and scope_kind='account'", [scope.workspace])
    const results = await Promise.all(Array.from({ length: 20 }, () => reserve(scope)))
    expect(results.filter(r => r.allowed)).toHaveLength(1)
    expect(results.filter(r => !r.allowed).every(r => r.reason === 'account_circuit_probe_in_flight')).toBe(true)
  })
  it('leaves AI fixed-window accounting independent from provider sends', async () => {
    const scope = await fixture()
    expect(await reserve(scope, { resource: 'ai_generation', accountLimit: 1 })).toMatchObject({ allowed: true })
    expect(await reserve(scope, { resource: 'ai_generation', accountLimit: 1 })).toMatchObject({ allowed: false, reason: 'account_budget_exhausted' })
    expect((await db.query('select count(*)::int as n from automation_provider_send_tokens where workspace_id=$1', [scope.workspace])).rows[0].n).toBe(0)
    expect(await reserve(scope)).toMatchObject({ allowed: true, account_remaining: 59 })
  })
  it('isolates tenants and keeps both RPC and token state service-only', async () => {
    const scope = await fixture(), other = await fixture()
    await reserve(scope, { accountLimit: 1 })
    expect(await reserve(other)).toMatchObject({ allowed: true })
    await expect(reserve({ ...scope, workspace: other.workspace })).rejects.toThrow('scope does not resolve')
    const access = (await db.query("select has_function_privilege('authenticated','reserve_automation_runtime_budget(uuid,uuid,uuid,text,integer,integer,integer,integer)','execute') as rpc, has_table_privilege('authenticated','automation_provider_send_tokens','select') as table_read")).rows[0]
    expect(access).toEqual({ rpc: false, table_read: false })
  })
  it('does not mint extra capacity when a policy is lowered', async () => {
    const scope = await fixture()
    await reserve(scope)
    expect(await reserve(scope, { accountLimit: 5, automationLimit: 5 })).toMatchObject({ allowed: true, account_remaining: 4, automation_remaining: 4 })
  })
})
