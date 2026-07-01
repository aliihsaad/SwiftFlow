import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  CLAIM_DUE_PUBLISHING_AUTOMATIONS_RPC,
  CLAIM_STALE_AFTER_MINUTES,
  claimDuePublishingAutomations,
  releasePublishingAutomationClaim,
  type ClaimClient,
} from "@/supabase/functions/process-publishing-automations/claim-locking"

const root = process.cwd()

function source(...segments: string[]) {
  return readFileSync(path.join(root, ...segments), "utf8")
}

type FakeRow = Record<string, unknown> & { id: string }

/**
 * In-memory stand-in for the publishing_automations table that mirrors the
 * semantics of the claim_due_publishing_automations() Postgres function
 * (supabase/migrations/20260701210000_add_publishing_automation_claim_locking.sql).
 * The whole claim in Postgres is a single atomic statement (FOR UPDATE SKIP
 * LOCKED); here that atomicity is modeled by mutating rows synchronously
 * inside one rpc call, with no await between read and write.
 */
class FakePublishingAutomationsDb implements ClaimClient {
  rows: FakeRow[] = []

  async rpc(fn: string, args: Record<string, unknown>) {
    if (fn !== CLAIM_DUE_PUBLISHING_AUTOMATIONS_RPC) {
      return { data: null, error: { message: `unknown rpc ${fn}` } }
    }
    const token = args.p_claim_token
    if (typeof token !== "string" || !token) {
      return { data: null, error: { message: "p_claim_token is required" } }
    }
    const limit = Math.min(Math.max(Number(args.p_limit) || 1, 1), 10)
    const staleMinutes = Math.max(Number(args.p_stale_after_minutes) || 30, 1)
    const now = Date.now()
    const staleBefore = now - staleMinutes * 60_000

    const due = this.rows
      .filter((row) =>
        row.is_active === true
        && (row.next_run_at == null || Date.parse(String(row.next_run_at)) <= now)
        && (
          row.claim_token == null
          || row.claimed_at == null
          || Date.parse(String(row.claimed_at)) <= staleBefore
        ))
      .sort((a, b) => {
        if (a.next_run_at == null) return -1
        if (b.next_run_at == null) return 1
        return Date.parse(String(a.next_run_at)) - Date.parse(String(b.next_run_at))
      })
      .slice(0, limit)

    for (const row of due) {
      row.claim_token = token
      row.claimed_at = new Date(now).toISOString()
      row.updated_at = new Date(now).toISOString()
    }

    return { data: due.map((row) => ({ ...row })), error: null }
  }

  from(table: string) {
    if (table !== "publishing_automations") throw new Error(`unexpected table ${table}`)
    const rows = this.rows
    return {
      update(values: Record<string, unknown>) {
        const filters: Array<[string, unknown]> = []
        type UpdateResult = { error: { message?: string } | null }
        const builder = {
          eq(column: string, value: unknown) {
            filters.push([column, value])
            return builder
          },
          then<TResult1 = UpdateResult, TResult2 = never>(
            onfulfilled?: ((value: UpdateResult) => TResult1 | PromiseLike<TResult1>) | null,
            onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
          ): Promise<TResult1 | TResult2> {
            const matched = rows.filter((row) => filters.every(([column, value]) => row[column] === value))
            for (const row of matched) Object.assign(row, values)
            return Promise.resolve<UpdateResult>({ error: null }).then(onfulfilled, onrejected)
          },
        }
        return builder
      },
    }
  }

  seedDueAutomation(id: string, overrides: Record<string, unknown> = {}) {
    this.rows.push({
      id,
      is_active: true,
      next_run_at: new Date(Date.now() - 60_000).toISOString(),
      claim_token: null,
      claimed_at: null,
      last_run_at: null,
      last_error: null,
      ...overrides,
    })
  }
}

/**
 * Simulates one process-publishing-automations invocation the way index.ts
 * runs it: claim due rows with a fresh per-invocation token, do async work,
 * then finalize with a token-guarded release that advances next_run_at.
 */
async function runSchedulerInvocation(
  db: FakePublishingAutomationsDb,
  firedRuns: Map<string, number>,
  limit = 3,
): Promise<string[]> {
  const claimToken = randomUUID()
  const rows = await claimDuePublishingAutomations(db, claimToken, limit)
  const claimedIds: string[] = []

  for (const row of rows) {
    const id = String(row.id)
    claimedIds.push(id)
    // Simulate the generation work between claim and finalize.
    await new Promise((resolve) => setTimeout(resolve, 1))
    firedRuns.set(id, (firedRuns.get(id) || 0) + 1)
    const releaseError = await releasePublishingAutomationClaim(db, id, claimToken, {
      last_run_at: new Date().toISOString(),
      last_error: null,
      next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    if (releaseError) throw new Error(releaseError)
  }

  return claimedIds
}

describe("publishing automation claim locking", () => {
  it("never double-fires an automation across concurrent scheduler ticks", async () => {
    const db = new FakePublishingAutomationsDb()
    for (let i = 0; i < 3; i += 1) db.seedDueAutomation(`automation-${i}`)

    const firedRuns = new Map<string, number>()
    const claims = await Promise.all([
      runSchedulerInvocation(db, firedRuns),
      runSchedulerInvocation(db, firedRuns),
      runSchedulerInvocation(db, firedRuns),
    ])

    const allClaimedIds = claims.flat()
    expect(allClaimedIds).toHaveLength(new Set(allClaimedIds).size)
    expect(firedRuns.size).toBe(3)
    for (const count of firedRuns.values()) expect(count).toBe(1)

    // Every row was finalized: claim released and next_run_at advanced.
    for (const row of db.rows) {
      expect(row.claim_token).toBeNull()
      expect(Date.parse(String(row.next_run_at))).toBeGreaterThan(Date.now())
    }

    // A follow-up tick finds nothing left to claim.
    const followUp = await claimDuePublishingAutomations(db, randomUUID(), 3)
    expect(followUp).toHaveLength(0)
  })

  it("does not hand a freshly claimed automation to another tick", async () => {
    const db = new FakePublishingAutomationsDb()
    db.seedDueAutomation("automation-in-flight", {
      claim_token: randomUUID(),
      claimed_at: new Date(Date.now() - 60_000).toISOString(),
    })

    const claimed = await claimDuePublishingAutomations(db, randomUUID(), 3)
    expect(claimed).toHaveLength(0)
  })

  it("recovers a stale lease left by a crashed invocation", async () => {
    const db = new FakePublishingAutomationsDb()
    const staleToken = randomUUID()
    db.seedDueAutomation("automation-stale", {
      claim_token: staleToken,
      claimed_at: new Date(Date.now() - (CLAIM_STALE_AFTER_MINUTES + 1) * 60_000).toISOString(),
    })

    const newToken = randomUUID()
    const claimed = await claimDuePublishingAutomations(db, newToken, 3)
    expect(claimed).toHaveLength(1)
    expect(db.rows[0].claim_token).toBe(newToken)
  })

  it("ignores a release from a stale invocation after the row was re-claimed", async () => {
    const db = new FakePublishingAutomationsDb()
    const staleToken = randomUUID()
    db.seedDueAutomation("automation-reclaimed", {
      claim_token: staleToken,
      claimed_at: new Date(Date.now() - (CLAIM_STALE_AFTER_MINUTES + 1) * 60_000).toISOString(),
    })

    const newToken = randomUUID()
    await claimDuePublishingAutomations(db, newToken, 1)

    // The crashed invocation wakes up late and tries to finalize.
    const staleRelease = await releasePublishingAutomationClaim(db, "automation-reclaimed", staleToken, {
      last_error: "late failure from stale invocation",
      next_run_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    expect(staleRelease).toBeNull()
    expect(db.rows[0].claim_token).toBe(newToken)
    expect(db.rows[0].last_error).toBeNull()

    // The current holder can still finalize normally.
    await releasePublishingAutomationClaim(db, "automation-reclaimed", newToken, {
      last_run_at: new Date().toISOString(),
    })
    expect(db.rows[0].claim_token).toBeNull()
  })

  it("keeps the Edge Function and migration wired to the atomic claim path", () => {
    const migration = source("supabase", "migrations", "20260701210000_add_publishing_automation_claim_locking.sql")
    expect(migration).toMatch(/for update skip locked/i)
    expect(migration).toMatch(/claim_token uuid/i)
    expect(migration).toMatch(/grant execute on function public\.claim_due_publishing_automations.* to service_role/i)

    const runner = source("supabase", "functions", "process-publishing-automations", "index.ts")
    expect(runner).toContain("crypto.randomUUID()")
    expect(runner).toContain("claimDuePublishingAutomations(supabase, claimToken, limit)")
    expect(runner).toContain("releasePublishingAutomationClaim")
    // The old non-atomic due-row select must not come back.
    expect(runner).not.toContain("next_run_at.is.null")
  })
})
