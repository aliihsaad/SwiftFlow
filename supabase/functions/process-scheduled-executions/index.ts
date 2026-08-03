// @ts-nocheck - Deno runtime
/**
 * Process Scheduled Executions
 *
 * This edge function runs on a cron schedule (every 1 minute) and
 * processes delayed workflow nodes that are ready to resume.
 *
 * It queries the automation_scheduled_executions table for pending
 * executions where scheduled_for <= now(), then resumes the graph
 * from where it left off.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { resumeFromDelay } from "../process-automations/graph-executor.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { finalizeScheduledExecution } from "./finalization.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const STALLED_RUN_AGE_MINUTES = 2
const STALLED_RUN_BATCH = 10
const ABANDONED_RUNNING_AGE_MINUTES = 30

function continuationErrorMessage(result): string | null {
  for (const nodeResult of Object.values(result?.nodeResults || {})) {
    if (nodeResult?.success === false && nodeResult?.error) {
      return String(nodeResult.error)
    }
  }
  return Number(result?.errors || 0) > 0 ? 'One or more delayed nodes failed' : null
}

async function mergeContinuationIntoRun(supabase, exec, result) {
  const runId = exec?.execution_context?.run_id
  if (!runId) return null

  const { data, error } = await supabase.rpc('apply_automation_run_continuation_result', {
    p_run_id: runId,
    p_node_results: result?.nodeResults || {},
    p_processed_count: Number(result?.processed || 0),
    p_dms_sent_count: Number(result?.dmsSent || 0),
    p_error_count: Number(result?.errors || 0),
    p_pending_continuations: Number(result?.pendingContinuations || 0),
    p_error_message: continuationErrorMessage(result),
  },
  )

  if (error) {
    throw new Error(`Failed to merge delayed run result: ${error.message}`)
  }

  const merged = Array.isArray(data) ? data[0] : data
  if (merged?.event_id && (merged.status === 'completed' || merged.status === 'failed')) {
    const { error: eventError } = await supabase
      .from('automation_events')
      .update({
        status: merged.status === 'completed' ? 'processed' : 'failed',
        processed_at: new Date().toISOString(),
      })
      .eq('id', merged.event_id)

    if (eventError) {
      console.error('[SCHEDULED] Failed to finalize automation event:', redactSensitiveLogValue(eventError),
      )
    }
  }

  return merged
}

async function markRunFinalizationFailure(supabase, exec, error) {
  const runId = exec?.execution_context?.run_id
  if (!runId) return

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('automation_runs')
    .update({
      status: 'failed',
      pending_continuation_count: 0,
      error_message: `Delayed run bookkeeping failed: ${error?.message || 'unknown error'}`,
      finished_at: now,
      updated_at: now,
    })
    .eq('id', runId)

  if (updateError) {
    console.error('[SCHEDULED] Failed to mark the parent run failed:', redactSensitiveLogValue(updateError),
    )
  }
}

/**
 * Safety net for the orchestrator's background dispatch: runs that stayed
 * 'queued' (dispatcher torn down / worker invocation failed) are re-invoked
 * here. automation-worker-run's atomic queued->running claim guarantees
 * exactly-once execution even if two ticks reclaim the same run.
 *
 * Runs stuck in 'running' far beyond any plausible execution are marked
 * failed for bookkeeping only — they are never re-executed because their
 * side effects (replies/DMs) may already have happened.
 */
async function reclaimStalledAutomationRuns(supabase,
): Promise<{ reclaimed: number; abandoned: number }> {
  const queuedCutoff = new Date(Date.now() - STALLED_RUN_AGE_MINUTES * 60 * 1000,
  ).toISOString()
  const { data: stalledRuns, error } = await supabase
    .from('automation_runs')
    .select('id, workspace_id, automation_id, workflow_version_id, event_id, trigger_type, trigger_context',
    )
    .eq('status', 'queued')
    .lt('created_at', queuedCutoff)
    .order('created_at', { ascending: true })
    .limit(STALLED_RUN_BATCH)

  if (error) {
    console.error('[SCHEDULED] Failed to list stalled automation runs:', redactSensitiveLogValue(error),
    )
    return { reclaimed: 0, abandoned: 0 }
  }

  const dispatchStalled = async () => {
    for (const run of stalledRuns || []) {
      const result = await invokeEdgeFunction('automation-worker-run', {
        run_id: run.id,
        workspace_id: run.workspace_id,
        automation_id: run.automation_id,
        workflow_version_id: run.workflow_version_id,
        event_id: run.event_id,
        trigger_type: run.trigger_type,
        trigger_context: run.trigger_context || {},
      })
      if (!result.ok) {
        console.error('[SCHEDULED] Stalled run redispatch failed (stays queued):', redactSensitiveLogValue({
          run_id: run.id,
          status: result.status,
          error: result.error,
        }),
        )
      }
    }
  }

  if ((stalledRuns || []).length > 0) {
    if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
      EdgeRuntime.waitUntil(dispatchStalled())
    } else {
      await dispatchStalled()
    }
  }

  const abandonedCutoff = new Date(Date.now() - ABANDONED_RUNNING_AGE_MINUTES * 60 * 1000,
  ).toISOString()
  const { data: abandonedRuns } = await supabase
    .from('automation_runs')
    .update({
      status: 'failed',
      error_message: 'Run abandoned: worker did not finish within the expected window',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('status', 'running')
    .lt('started_at', abandonedCutoff)
    .select('id')

  return { reclaimed: (stalledRuns || []).length, abandoned: (abandonedRuns || []).length,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const unauthorized = await assertInternalInvoke(req, corsHeaders);
  if (unauthorized) return unauthorized;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Reclaim webhook-triggered runs whose background dispatch was lost.
    const reclaim = await reclaimStalledAutomationRuns(supabase);
    if (reclaim.reclaimed > 0 || reclaim.abandoned > 0) {
      console.log(`[SCHEDULED] Reclaimed ${reclaim.reclaimed} stalled run(s), abandoned ${reclaim.abandoned}`,
      );
    }

    // Atomically claim due executions (FOR UPDATE SKIP LOCKED + claim token)
    // so overlapping scheduler ticks never resume the same delayed node twice.
    const { data: expiredApprovalCount, error: approvalExpiryError } =
      await supabase.rpc('expire_due_telegram_approval_requests', {
        p_limit: 50,
      })
    if (approvalExpiryError) {
      throw new Error(
        `Failed to expire Telegram approvals: ${approvalExpiryError.message}`,
      )
    }
    const expiredApprovals = Number(expiredApprovalCount || 0)

    // Atomically claim due executions (FOR UPDATE SKIP LOCKED + claim token)
    // so overlapping scheduler ticks never resume the same delayed node twice.
    const claimToken = crypto.randomUUID();
    const { data: pendingExecs, error: fetchError } = await supabase
      .rpc('claim_due_scheduled_executions', {
        p_claim_token: claimToken,
        p_limit: 50,
        p_stale_after_minutes: 30,
      },
    );

    if (fetchError) {
      throw new Error(`Failed to claim scheduled executions: ${fetchError.message}`,
      );
    }

    if (!pendingExecs || pendingExecs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending executions', count: 0, reclaim,
          expiredApprovals,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        },
      );
    }

    console.log(`[SCHEDULED] Processing ${pendingExecs.length} pending execution(s)`,
    );

    let processed = 0;
    let errors = 0;

    for (const exec of pendingExecs) {
      let scheduledFinalized = false;
      try {
        // Rows are already claimed + marked 'executing' by the RPC.
        // Resume execution
        const result = await resumeFromDelay(supabase, exec);
        const executedAt = new Date().toISOString();

        const finalization = await finalizeScheduledExecution(supabase, exec.id, claimToken, {
          status: result.errors > 0 ? 'failed' : 'completed',
          executed_at: executedAt,
          execution_context: {
            ...(exec.execution_context || {}),
            resume_result: result,
            resumed_at: executedAt,
          },
        },
        );
        if (!finalization.finalized) {
          errors++;
          console.warn(`[SCHEDULED] Execution ${exec.id} was not counted because its claim was already lost`,
          );
          continue;
        }

        scheduledFinalized = true;
        await mergeContinuationIntoRun(supabase, exec, result);

        // Update automation stats
        if (result.processed > 0 || result.dmsSent > 0) {
          const { data: current } = await supabase
            .from('automations')
            .select('total_triggered, total_dms_sent')
            .eq('id', exec.automation_id)
            .single();

          if (current) {
            await supabase
              .from('automations')
              .update({
                total_triggered: (current.total_triggered || 0) + result.processed,
                total_dms_sent: (current.total_dms_sent || 0) + result.dmsSent,
                updated_at: new Date().toISOString(),
              })
              .eq('id', exec.automation_id);
          }
        }

        processed++;
        console.log(`[SCHEDULED] Execution ${exec.id} completed: ${JSON.stringify(result)}`,
        );
      } catch (err) {
        errors++;
        console.error(`[SCHEDULED] Execution ${exec.id} failed:`, redactSensitiveLogValue(err),
        );

        if (scheduledFinalized) {
          await markRunFinalizationFailure(supabase, exec, err);
          continue;
        }

        const executedAt = new Date().toISOString();

        try {
          const finalization = await finalizeScheduledExecution(supabase, exec.id, claimToken, {
            status: 'failed',
            executed_at: executedAt,
            execution_context: {
              ...(exec.execution_context || {}),
              resume_error: err?.message || 'Unknown error',
              resumed_at: executedAt,
            },
          },
          );
          if (!finalization.finalized) {
            console.warn(`[SCHEDULED] Failed execution ${exec.id} was not finalized because its claim was already lost`,
            );
            continue;
          }

          scheduledFinalized = true;
          await mergeContinuationIntoRun(supabase, exec, {
            processed: 0,
            dmsSent: 0,
            errors: 1,
            pendingContinuations: 0,
            nodeResults: {
              [`scheduled:${exec.id}`]: {
                success: false,
                error: err?.message || 'Delayed execution failed',
              },
            },
          });
        } catch (finalizeErr) {
          console.error(`[SCHEDULED] Failed to record failure for execution ${exec.id}:`, redactSensitiveLogValue(finalizeErr),
          );
          if (scheduledFinalized) {
            await markRunFinalizationFailure(supabase, exec, finalizeErr);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} scheduled execution(s)`,
        stats: { total: pendingExecs.length, processed, errors, reclaim,
          expiredApprovals,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      },
    );
  } catch (error) {
    console.error('[SCHEDULED] Error:', redactSensitiveLogValue(error));
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      },
    );
  }
});
