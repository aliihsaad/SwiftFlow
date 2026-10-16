/** Only pre-execution denials are safe to retry automatically. */
const RETRYABLE_GUARD_REASONS = new Set([
  'account_budget_exhausted', 'automation_budget_exhausted',
  'account_circuit_open', 'automation_circuit_open',
  'account_circuit_probe_in_flight', 'automation_circuit_probe_in_flight',
  'runtime_guard_unavailable',
]);

export function isRetryableRuntimeGuard(reason: string): boolean {
  return RETRYABLE_GUARD_REASONS.has(reason);
}

export interface DeferredNodeResult {
  success: false;
  deferred: true;
  output: {
    guarded?: boolean;
    reason: string;
    retry_after_seconds: number;
    scheduled_for?: string;
    [key: string]: unknown;
  };
}

/** Persist the entire remaining queue, not just the blocked node's children.
 * No completed node (including AI generation) is replayed on resumption.
 */
export async function scheduleAutomationContinuation(params: {
  supabase: any;
  automation: any;
  runId?: string;
  nodeId: string;
  remainingQueue: string[];
  visited: Set<string>;
  triggerContext: Record<string, unknown>;
  nodeOutputs: Record<string, unknown>;
  deferred: DeferredNodeResult;
  now?: number;
  random?: () => number;
}): Promise<void> {
  const { automation, nodeId, deferred } = params;
  if (!params.runId || !(automation.workflow_version_id || automation.current_workflow_version_id)) {
    throw new Error('Cannot queue an automation without a run and pinned workflow version');
  }
  // A minimum delay gives the current worker time to finalize its run. Jitter
  // spreads capacity-window retries instead of waking every comment at once.
  const delay = Math.max(60, Number(deferred.output.retry_after_seconds) || 60)
    + Math.floor((params.random || Math.random)() * 30);
  const scheduledFor = new Date((params.now ?? Date.now()) + delay * 1000).toISOString();
  const waitingResult = {
    ...deferred,
    output: { ...deferred.output, scheduled_for: scheduledFor },
  };
  const { error } = await params.supabase.from('automation_scheduled_executions').insert({
    automation_id: automation.id,
    workflow_version_id: automation.workflow_version_id || automation.current_workflow_version_id,
    execution_id: crypto.randomUUID(),
    node_id: nodeId,
    execution_context: {
      automation_id: automation.id,
      workspace_id: automation.workspace_id,
      run_id: params.runId,
      trigger_data: params.triggerContext,
      next_nodes: [nodeId, ...params.remainingQueue],
      visited_nodes: [...params.visited].filter((id) => id !== nodeId),
      node_outputs: { ...params.nodeOutputs, [nodeId]: waitingResult },
      continuation_reason: deferred.output.reason,
    },
    scheduled_for: scheduledFor,
    status: 'pending',
  });
  if (error) throw new Error(`Failed to queue automation continuation: ${error.message || 'database error'}`);
  deferred.output.scheduled_for = scheduledFor;
}
