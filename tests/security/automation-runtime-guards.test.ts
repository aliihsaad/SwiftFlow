import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

const migration = readRepositoryFile(
  "supabase/migrations/20260728120000_add_automation_runtime_guards.sql",
)
const graphExecutor = readRepositoryFile(
  "supabase/functions/process-automations/graph-executor.ts",
)
const actionExecutor = readRepositoryFile("lib/automation/action-executor.ts")
const executorWorker = readRepositoryFile("workers/action-executor.ts")

describe("distributed automation runtime guards", () => {
  it("reserves account and automation budgets atomically under scoped locks", () => {
    expect(migration).toContain("automation_runtime_budget_buckets")
    expect(migration).toContain("automation_runtime_circuits")
    expect(migration).toContain("pg_advisory_xact_lock")
    expect(migration).toContain("'account'")
    expect(migration).toContain("'automation'")
    expect(migration).toContain("'provider_send'")
    expect(migration).toContain("'ai_generation'")
    expect(migration).toContain("automation.social_account_id = account.id")
    expect(migration).toContain("account.workspace_id = p_workspace_id")
    expect(migration).toContain("automation runtime guard scope does not resolve")
  })

  it("keeps guard tables private and exposes only security-definer functions", () => {
    expect(migration).toContain("security definer")
    expect(migration).toMatch(
      /revoke all on function public\.reserve_automation_runtime_budget[\s\S]+from public/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.reserve_automation_runtime_budget[\s\S]+swiftflow_action_executor/i,
    )
    expect(migration).not.toMatch(
      /grant select on table public\.automation_runtime_(?:budget_buckets|circuits) to swiftflow_action_executor/i,
    )
  })

  it("guards every canvas provider-send and AI node before execution", () => {
    const guardMap = graphExecutor.slice(
      graphExecutor.indexOf("GUARDED_RESOURCE_BY_NODE_TYPE"),
      graphExecutor.indexOf("async function executeNodeUnchecked"),
    )
    for (const nodeType of [
      "action_reply_comment",
      "action_send_dm",
      "action_private_reply",
      "action_ai_response",
    ]) {
      expect(guardMap).toContain(nodeType)
    }
    expect(guardMap.indexOf("reserveAutomationRuntimeBudget"))
      .toBeLessThan(guardMap.indexOf("result = await executeNodeUnchecked"))
    expect(guardMap).toContain("recordAutomationRuntimeOutcome")
  })

  it("requires the PostgreSQL guard before the dedicated provider adapter", () => {
    const processOne = actionExecutor.slice(actionExecutor.indexOf("private async processOne"))
    expect(processOne.indexOf("runtimeGuard.reserve"))
      .toBeLessThan(processOne.indexOf("adapter.send"))
    expect(executorWorker).toContain("new PostgresAutomationRuntimeGuard(database)")
  })
})
