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
async function reclaimStalledAutomationRuns(supabase): Promise<{ reclaimed: number; abandoned: number }> {
  const queuedCutoff = new Date(Date.now() - STALLED_RUN_AGE_MINUTES * 60 * 1000).toISOString()
  const { data: stalledRuns, error } = await supabase
    .from('automation_runs')
    .select('id, workspace_id, automation_id, event_id, trigger_type, trigger_context')
    .eq('status', 'queued')
    .lt('created_at', queuedCutoff)
    .order('created_at', { ascending: true })
    .limit(STALLED_RUN_BATCH)

  if (error) {
    console.error('[SCHEDULED] Failed to list stalled automation runs:', redactSensitiveLogValue(error))
    return { reclaimed: 0, abandoned: 0 }
  }

  const dispatchStalled = async () => {
    for (const run of stalledRuns || []) {
      const result = await invokeEdgeFunction('automation-worker-run', {
        run_id: run.id,
        workspace_id: run.workspace_id,
        automation_id: run.automation_id,
        event_id: run.event_id,
        trigger_type: run.trigger_type,
        trigger_context: run.trigger_context || {},
      })
      if (!result.ok) {
        console.error('[SCHEDULED] Stalled run redispatch failed (stays queued):', redactSensitiveLogValue({
          run_id: run.id,
          status: result.status,
          error: result.error,
        }))
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

  const abandonedCutoff = new Date(Date.now() - ABANDONED_RUNNING_AGE_MINUTES * 60 * 1000).toISOString()
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

  return { reclaimed: (stalledRuns || []).length, abandoned: (abandonedRuns || []).length }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const unauthorized = assertInternalInvoke(req, corsHeaders);
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
      console.log(`[SCHEDULED] Reclaimed ${reclaim.reclaimed} stalled run(s), abandoned ${reclaim.abandoned}`);
    }

    // Atomically claim due executions (FOR UPDATE SKIP LOCKED + claim token)
    // so overlapping scheduler ticks never resume the same delayed node twice.
    const claimToken = crypto.randomUUID();
    const { data: pendingExecs, error: fetchError } = await supabase
      .rpc('claim_due_scheduled_executions', {
        p_claim_token: claimToken,
        p_limit: 50,
        p_stale_after_minutes: 30,
      });

    if (fetchError) {
      throw new Error(`Failed to claim scheduled executions: ${fetchError.message}`);
    }

    if (!pendingExecs || pendingExecs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending executions', count: 0, reclaim }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    console.log(`[SCHEDULED] Processing ${pendingExecs.length} pending execution(s)`);

    let processed = 0;
    let errors = 0;

    for (const exec of pendingExecs) {
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
        });
        if (!finalization.finalized) {
          errors++;
          console.warn(`[SCHEDULED] Execution ${exec.id} was not counted because its claim was already lost`);
          continue;
        }

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
        console.log(`[SCHEDULED] Execution ${exec.id} completed: ${JSON.stringify(result)}`);
      } catch (err) {
        errors++;
        console.error(`[SCHEDULED] Execution ${exec.id} failed:`, redactSensitiveLogValue(err));
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
          });
          if (!finalization.finalized) {
            console.warn(`[SCHEDULED] Failed execution ${exec.id} was not finalized because its claim was already lost`);
          }
        } catch (finalizeErr) {
          console.error(`[SCHEDULED] Failed to record failure for execution ${exec.id}:`, redactSensitiveLogValue(finalizeErr));
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} scheduled execution(s)`,
        stats: { total: pendingExecs.length, processed, errors, reclaim },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('[SCHEDULED] Error:', redactSensitiveLogValue(error));
    return new Response(
      JSON.stringify({ error: error.message || 'Internal error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
