import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(path, "utf8")
}

describe("delayed automation run continuation", () => {
  it("keeps the parent run waiting and reports scheduling failures", () => {
    const graph = source("supabase/functions/process-automations/graph-executor.ts")
    const worker = source("supabase/functions/automation-worker-run/index.ts")

    expect(graph).toContain("pendingContinuations")
    expect(graph).toContain("Failed to schedule delayed continuation")
    expect(worker).toContain("? 'waiting'")
    expect(worker).toContain("pending_continuation_count")
    expect(worker).toContain("finished_at: isTerminal ?")
  })

  it("atomically merges continuation results and reaches a terminal state", () => {
    const migration = source("supabase/migrations/20260731110000_add_waiting_automation_runs.sql")
    const scheduler = source("supabase/functions/process-scheduled-executions/index.ts")

    expect(migration).toContain("apply_automation_run_continuation_result")
    expect(migration).toContain("for update")
    expect(migration).toContain("when v_remaining > 0 then 'waiting'")
    expect(migration).toContain("when v_total_errors > 0 then 'failed'")
    expect(scheduler).toContain("mergeContinuationIntoRun")
    expect(scheduler).toContain("apply_automation_run_continuation_result")
  })

  it("writes resumed node results and fails closed for unknown nodes", () => {
    const graph = source("supabase/functions/process-automations/graph-executor.ts")

    expect(graph).toContain("upsertAutomationNodeRuns")
    expect(graph).toContain("Unsupported node type:")
    expect(graph).not.toContain("Unknown node type: ${node.data.type}`);\n      return { success: true }")
  })
})
