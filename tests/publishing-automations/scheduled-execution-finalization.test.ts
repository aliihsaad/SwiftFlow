import { describe, expect, it } from "vitest"
import {
  finalizeScheduledExecution,
  type ScheduledExecutionFinalizationClient,
} from "@/supabase/functions/process-scheduled-executions/finalization"

type FakeRow = Record<string, unknown> & { id: string; claim_token: string | null; claimed_at: string | null }

class FakeScheduledExecutionDb implements ScheduledExecutionFinalizationClient {
  rows: FakeRow[] = []
  updateError: { message?: string } | null = null

  from(table: string) {
    if (table !== "automation_scheduled_executions") throw new Error(`unexpected table ${table}`)
    const rows = this.rows
    const getUpdateError = () => this.updateError
    return {
      update(values: Record<string, unknown>) {
        const filters: Array<[string, unknown]> = []
        const builder = {
          eq(column: string, value: unknown) {
            filters.push([column, value])
            return builder
          },
          select(columns: string) {
            void columns
            return {
              async maybeSingle() {
                const updateError = getUpdateError()
                if (updateError) return { data: null, error: updateError }

                const row = rows.find((entry) => filters.every(([column, value]) => entry[column] === value))
                if (!row) return { data: null, error: null }

                Object.assign(row, values)
                return { data: { id: row.id }, error: null }
              },
            }
          },
        }
        return builder
      },
    }
  }
}

describe("scheduled execution finalization", () => {
  it("finalizes only the row currently held by this claim token", async () => {
    const db = new FakeScheduledExecutionDb()
    db.rows.push({
      id: "exec-1",
      status: "executing",
      claim_token: "current-token",
      claimed_at: new Date().toISOString(),
    })

    await expect(finalizeScheduledExecution(db, "exec-1", "current-token", {
      status: "completed",
      executed_at: "2026-07-02T10:00:00.000Z",
    })).resolves.toEqual({ finalized: true })

    expect(db.rows[0]).toMatchObject({
      id: "exec-1",
      status: "completed",
      claim_token: null,
      claimed_at: null,
      executed_at: "2026-07-02T10:00:00.000Z",
    })
  })

  it("reports a lost claim without mutating a row claimed by a newer invocation", async () => {
    const db = new FakeScheduledExecutionDb()
    db.rows.push({
      id: "exec-1",
      status: "executing",
      claim_token: "new-token",
      claimed_at: new Date().toISOString(),
    })

    await expect(finalizeScheduledExecution(db, "exec-1", "stale-token", {
      status: "completed",
    })).resolves.toEqual({ finalized: false, reason: "lost_claim" })

    expect(db.rows[0]).toMatchObject({
      id: "exec-1",
      status: "executing",
      claim_token: "new-token",
    })
  })

  it("throws update errors so the runner cannot count unconfirmed work", async () => {
    const db = new FakeScheduledExecutionDb()
    db.updateError = { message: "database unavailable" }
    db.rows.push({
      id: "exec-1",
      status: "executing",
      claim_token: "current-token",
      claimed_at: new Date().toISOString(),
    })

    await expect(finalizeScheduledExecution(db, "exec-1", "current-token", {
      status: "completed",
    })).rejects.toThrow("database unavailable")

    expect(db.rows[0]).toMatchObject({
      status: "executing",
      claim_token: "current-token",
    })
  })
})
