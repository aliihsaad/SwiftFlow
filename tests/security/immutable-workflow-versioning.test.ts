import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

function readRepositoryFile(file: string): string {
  return readFileSync(path.join(process.cwd(), file), "utf8")
}

const migration = readRepositoryFile(
  "supabase/migrations/20260728100000_add_immutable_automation_workflow_versions.sql",
)
const planner = readRepositoryFile("lib/webhooks/comment-action-planner.ts")
const comparison = readRepositoryFile("lib/webhooks/comment-private-reply-comparison.ts")
const orchestrator = readRepositoryFile("supabase/functions/automation-orchestrator/index.ts")
const runWorker = readRepositoryFile("supabase/functions/automation-worker-run/index.ts")
const graphExecutor = readRepositoryFile(
  "supabase/functions/process-automations/graph-executor.ts",
)

describe("immutable workflow version schema", () => {
  it("captures graph changes in an append-only version ledger", () => {
    expect(migration).toContain("create table if not exists public.automation_workflow_versions")
    expect(migration).toContain("unique (automation_id, version_number)")
    expect(migration).toContain("automations_capture_workflow_version")
    expect(migration).toContain("capture_automation_workflow_version")
    expect(migration).toContain("automation workflow versions are immutable")
    expect(migration).toContain("current_workflow_version_id")
  })

  it("pins runs, delayed continuations, and provider actions to version rows", () => {
    expect(migration).toContain("automation_runs_workflow_version_fkey")
    expect(migration).toContain("automation_scheduled_executions_workflow_version_fkey")
    expect(migration).toContain("automation_action_outbox_workflow_version_fkey")
    expect(migration).toContain(
      "references public.automation_workflow_versions(automation_id, id)",
    )
    expect(migration).toContain("pin_automation_execution_workflow_version")
    expect(migration).toContain("legacy_workflow_snapshot_id")
  })
})

describe("runtime version selection", () => {
  it("uses the persisted version id for provider-action identity", () => {
    expect(planner).toContain("workflowVersionId: string")
    expect(planner).toContain("workflowVersionId,")
    expect(planner).not.toContain("deriveWorkflowVersionId")
    expect(comparison).toContain("automation.current_workflow_version_id")
    expect(comparison).toContain("workflowVersionId: automation.workflowVersionId")
  })

  it("loads the pinned graph for queued runs instead of the editable graph", () => {
    expect(orchestrator).toContain("current_workflow_version_id")
    expect(orchestrator).toContain("workflow_version_id: automation.current_workflow_version_id")
    expect(runWorker).toContain(".from('automation_workflow_versions')")
    expect(runWorker).toContain("automation.workflow_graph = workflowVersion.workflow_graph")
    expect(runWorker).toContain("Canvas automation run is missing its immutable workflow version")
  })

  it("carries the same version through every delayed continuation", () => {
    expect(graphExecutor).toMatch(
      /automation\.workflow_version_id\s*\|\|\s*automation\.current_workflow_version_id/,
    )
    expect(graphExecutor).toMatch(/\.from\(["']automation_workflow_versions["']\)/)
    expect(graphExecutor).toContain("workflow_version_id: automation.workflow_version_id")
    expect(graphExecutor).not.toMatch(
      /const graph: WorkflowGraph = automation\.workflow_graph;[\s\S]{0,300}scheduledExec[\s\S]{0,300}from\('automations'\)/,
    )
  })
})
