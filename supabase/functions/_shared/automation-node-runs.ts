// @ts-nocheck - Deno runtime
import { redactSensitiveLogValue } from "./log-redaction.ts"

export async function upsertAutomationNodeRuns(params: {
  supabase: any
  workspaceId: string
  automation: any
  runId?: string | null
  triggerContext: Record<string, unknown>
  nodeResults: Record<string, { success: boolean; output?: any; error?: string }>
}) {
  const { supabase, workspaceId, automation, runId, triggerContext, nodeResults } = params
  if (!runId) return

  const nodes = automation?.workflow_graph?.nodes || []
  const byId = new Map(nodes.map((node: any) => [node.id, node]))
  const now = new Date().toISOString()
  const rows = Object.entries(nodeResults || {}).map(([nodeId, nodeResult]) => {
    const node = byId.get(nodeId)
    return {
      workspace_id: workspaceId,
      automation_id: automation.id,
      run_id: runId,
      node_id: nodeId,
      node_type: node?.data?.type || "unknown",
      status: nodeResult.success ? "completed" : "failed",
      input: redactSensitiveLogValue({
        config: node?.data?.config || {},
        trigger_context: triggerContext || {},
      }),
      output: redactSensitiveLogValue(nodeResult.output || {}),
      error_message: redactSensitiveLogValue(String(nodeResult.error || "")) || null,
      started_at: now,
      finished_at: now,
      updated_at: now,
    }
  })

  if (!rows.length) return

  const { error } = await supabase
    .from("automation_node_runs")
    .upsert(rows, { onConflict: "run_id,node_id" })

  if (error) {
    console.error("[AUTOMATION_NODE_RUNS] Failed to write node results:", redactSensitiveLogValue(error))
  }
}
