import crypto from "node:crypto"
import type { AddressInfo } from "node:net"
import type { Server } from "node:http"

import { Pool } from "pg"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  assertWebhookIngressDatabaseAccess,
  assertWebhookIngressDatabaseReady,
  resolveWebhookIngressConfig,
} from "@/lib/webhooks/ingress-runtime"
import { createPostgresQueryClient } from "@/lib/webhooks/postgres-inbox-repository"
import { createPostgresWebhookInboxStore } from "@/lib/webhooks/postgres-inbox-store"
import { createWebhookIngressServer } from "@/workers/webhook-ingress"

const APP_SECRET = "integration-app-secret"
const VERIFY_TOKEN = "integration-verify-token"

function requireLocalTestDatabaseUrl(variableName: string): string {
  const value = process.env[variableName]?.trim()
  if (!value) {
    throw new Error(`${variableName} is required`)
  }

  const url = new URL(value)
  const databaseName = url.pathname.replace(/^\//, "")
  const localHosts = new Set(["127.0.0.1", "localhost", "[::1]"])
  if (!localHosts.has(url.hostname) || !databaseName.toLowerCase().includes("test")) {
    throw new Error("PostgreSQL integration tests require a local database with 'test' in its name")
  }
  return value
}

function commentDelivery(commentId: string, accountId = "ig-account-1"): string {
  return JSON.stringify({
    object: "instagram",
    entry: [
      {
        id: accountId,
        time: 1_700_000_000,
        changes: [{ field: "comments", value: { id: commentId, text: "hello" } }],
      },
    ],
  })
}

function sign(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`
}

const config = resolveWebhookIngressConfig({
  META_WEBHOOK_VERIFY_TOKEN: VERIFY_TOKEN,
  META_APP_SECRET: APP_SECRET,
  WEBHOOK_INGRESS_HOST: "127.0.0.1",
})

let adminPool: Pool
let ingressPool: Pool
let server: Server
let ingressBaseUrl: string

async function inboxRows(): Promise<Record<string, unknown>[]> {
  const result = await adminPool.query(`
    select
      provider,
      provider_event_key,
      provider_object,
      event_type,
      account_external_id,
      delivery_hash,
      payload,
      status,
      attempt_count,
      workspace_id,
      social_account_id,
      locked_by,
      processed_at,
      result
    from public.webhook_inbox_events
    order by provider_event_key
  `)
  return result.rows
}

beforeAll(async () => {
  adminPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_DATABASE_URL"),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  ingressPool = new Pool({
    connectionString: requireLocalTestDatabaseUrl("SWIFTFLOW_TEST_INGRESS_DATABASE_URL"),
    max: 4,
    connectionTimeoutMillis: 5_000,
  })
  await adminPool.query("select 1")
  await ingressPool.query("select 1")

  server = createWebhookIngressServer(
    config,
    createPostgresWebhookInboxStore(createPostgresQueryClient(ingressPool)),
  )
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen())
  })
  const address = server.address() as AddressInfo
  ingressBaseUrl = `http://127.0.0.1:${address.port}`
})

beforeEach(async () => {
  await adminPool.query(`
    truncate table
      public.webhook_inbox_events,
      public.automations,
      public.social_accounts,
      public.workspaces
    restart identity cascade
  `)
})

afterAll(async () => {
  await new Promise<void>((resolveClose) => {
    server?.close(() => resolveClose())
  })
  await adminPool?.end()
  await ingressPool?.end()
})

describe("webhook ingress database role", () => {
  it("satisfies the append-only least-privilege contract", async () => {
    const database = createPostgresQueryClient(ingressPool)

    await expect(assertWebhookIngressDatabaseReady(database)).resolves.toBeUndefined()
    await expect(assertWebhookIngressDatabaseAccess(database)).resolves.toBeUndefined()
  })

  it("rejects an over-privileged connection at startup", async () => {
    await expect(
      assertWebhookIngressDatabaseAccess(createPostgresQueryClient(adminPool)),
    ).rejects.toThrow(/not append-only/)
  })

  it("cannot read, update, or delete stored events", async () => {
    await adminPool.query(`
      insert into public.webhook_inbox_events (
        provider, provider_event_key, provider_object, event_type, delivery_hash
      )
      values ('meta', 'existing-key', 'instagram', 'comments', $1)
    `, ["b".repeat(64)])

    await expect(ingressPool.query("select id from public.webhook_inbox_events"))
      .rejects.toThrow(/permission denied/i)
    await expect(ingressPool.query(
      "update public.webhook_inbox_events set status = 'succeeded'",
    )).rejects.toThrow(/permission denied/i)
    await expect(ingressPool.query("delete from public.webhook_inbox_events"))
      .rejects.toThrow(/permission denied/i)
  })

  it("cannot claim work or reach account and automation data", async () => {
    await expect(ingressPool.query(
      "select * from public.claim_webhook_inbox_events('ingress', 1, 30)",
    )).rejects.toThrow(/permission denied/i)
    await expect(ingressPool.query("select account_id from public.social_accounts"))
      .rejects.toThrow(/permission denied/i)
    await expect(ingressPool.query("select workflow_graph from public.automations"))
      .rejects.toThrow(/permission denied/i)
    await expect(ingressPool.query("select id from public.workspaces"))
      .rejects.toThrow(/permission denied/i)
  })

  it("cannot create objects in the public schema", async () => {
    await expect(ingressPool.query("create table public.ingress_escalation (id int)"))
      .rejects.toThrow(/permission denied/i)
  })

  it("relies on a single unique constraint", async () => {
    // The store uses an untargeted `on conflict do nothing` because naming an
    // arbiter needs select privilege. That is only safe while the provider
    // event key is the sole uniqueness rule an insert can violate.
    const result = await adminPool.query<{ conname: string; contype: string }>(`
      select conname, contype
      from pg_constraint
      where conrelid = 'public.webhook_inbox_events'::regclass
        and contype in ('p', 'u', 'x')
      order by conname
    `)

    expect(result.rows.map((row) => `${row.contype}:${row.conname}`)).toEqual([
      "p:webhook_inbox_events_pkey",
      "u:webhook_inbox_events_provider_key_unique",
    ])
  })

  it("still rejects a malformed row instead of silently skipping it", async () => {
    await expect(ingressPool.query(`
      insert into public.webhook_inbox_events (
        provider, provider_event_key, provider_object, event_type, delivery_hash
      )
      values ('meta', 'malformed-hash', 'instagram', 'comments', 'not-a-sha256')
      on conflict do nothing
    `)).rejects.toThrow(/delivery_hash_check/i)
  })
})

describe("postgres webhook inbox store under the ingress role", () => {
  it("appends an event in its unclaimed initial state", async () => {
    const store = createPostgresWebhookInboxStore(createPostgresQueryClient(ingressPool))

    const result = await store.enqueue([{
      provider: "meta",
      providerEventKey: "instagram:ig-account-1:change:comments:c1",
      providerObject: "instagram",
      eventType: "comments",
      accountExternalId: "ig-account-1",
      deliveryHash: "c".repeat(64),
      payload: { transport: "changes", change: { field: "comments" } },
    }])

    expect(result).toEqual({ total: 1, inserted: 1, duplicates: 0 })

    const rows = await inboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      provider: "meta",
      provider_object: "instagram",
      event_type: "comments",
      account_external_id: "ig-account-1",
      status: "pending",
      attempt_count: 0,
      workspace_id: null,
      social_account_id: null,
      locked_by: null,
      processed_at: null,
    })
    expect(rows[0]!.payload).toMatchObject({ transport: "changes" })
  })

  it("deduplicates a replayed provider event key without reading the inbox", async () => {
    const store = createPostgresWebhookInboxStore(createPostgresQueryClient(ingressPool))
    const event = {
      provider: "meta",
      providerEventKey: "instagram:ig-account-1:change:comments:replayed",
      providerObject: "instagram",
      eventType: "comments",
      accountExternalId: "ig-account-1",
      deliveryHash: "d".repeat(64),
      payload: {},
    } as const

    await store.enqueue([{ ...event }])
    const replay = await store.enqueue([{ ...event }])

    expect(replay).toEqual({ total: 1, inserted: 0, duplicates: 1 })
    expect(await inboxRows()).toHaveLength(1)
  })

  it("appends a mixed batch and skips only the keys already stored", async () => {
    const store = createPostgresWebhookInboxStore(createPostgresQueryClient(ingressPool))
    const event = (key: string) => ({
      provider: "meta" as const,
      providerEventKey: key,
      providerObject: "instagram" as const,
      eventType: "comments",
      accountExternalId: "ig-account-1",
      deliveryHash: "e".repeat(64),
      payload: {},
    })

    await store.enqueue([event("key-1")])
    const mixed = await store.enqueue([event("key-1"), event("key-2"), event("key-3")])

    expect(mixed).toEqual({ total: 3, inserted: 2, duplicates: 1 })
    expect(await inboxRows()).toHaveLength(3)
  })
})

describe("webhook ingress over HTTP", () => {
  it("completes the Meta subscription handshake", async () => {
    const url = new URL(`${ingressBaseUrl}${config.deliveryPath}`)
    url.searchParams.set("hub.mode", "subscribe")
    url.searchParams.set("hub.verify_token", VERIFY_TOKEN)
    url.searchParams.set("hub.challenge", "challenge-1234")

    const response = await fetch(url)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("challenge-1234")
  })

  it("stores a signed delivery and deduplicates its replay", async () => {
    const body = commentDelivery("http-comment-1")
    const headers = {
      "content-type": "application/json",
      "x-hub-signature-256": sign(body),
    }

    const first = await fetch(`${ingressBaseUrl}${config.deliveryPath}`, {
      method: "POST",
      headers,
      body,
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({
      received: true,
      total: 1,
      inserted: 1,
      duplicates: 0,
    })

    const replay = await fetch(`${ingressBaseUrl}${config.deliveryPath}`, {
      method: "POST",
      headers,
      body,
    })
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({ inserted: 0, duplicates: 1 })

    const rows = await inboxRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      provider_event_key: "instagram:ig-account-1:change:comments:http-comment-1",
      status: "pending",
      attempt_count: 0,
    })
  })

  it("stores nothing for an unsigned or forged delivery", async () => {
    const body = commentDelivery("http-comment-2")

    const unsigned = await fetch(`${ingressBaseUrl}${config.deliveryPath}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
    const forged = await fetch(`${ingressBaseUrl}${config.deliveryPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(body, "attacker-secret"),
      },
      body,
    })

    expect(unsigned.status).toBe(401)
    expect(forged.status).toBe(401)
    expect(await inboxRows()).toHaveLength(0)
  })

  it("rejects a payload larger than the configured cap", async () => {
    const oversized = JSON.stringify({
      object: "instagram",
      entry: [{ id: "ig-account-1", changes: [{ field: "comments", value: { id: "x", text: "y".repeat(config.maxBodyBytes) } }] }],
    })

    const response = await fetch(`${ingressBaseUrl}${config.deliveryPath}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": sign(oversized),
      },
      body: oversized,
    })

    expect(response.status).toBe(413)
    expect(await inboxRows()).toHaveLength(0)
  })

  it("answers the health path and hides unknown paths", async () => {
    const health = await fetch(`${ingressBaseUrl}${config.healthPath}`)
    const unknown = await fetch(`${ingressBaseUrl}/`)

    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: "ok" })
    expect(unknown.status).toBe(404)
  })
})
