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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isAuthorizedInternalInvoke(req: Request): boolean {
  const expectedApiKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const providedApiKey = req.headers.get('apikey') || '';

  if (!expectedApiKey) {
    console.error('[process-scheduled-executions] Missing SUPABASE_SERVICE_ROLE_KEY for internal auth check');
    return false;
  }

  return providedApiKey === expectedApiKey;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!isAuthorizedInternalInvoke(req)) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 },
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch pending scheduled executions that are due
    const { data: pendingExecs, error: fetchError } = await supabase
      .from('automation_scheduled_executions')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50); // Process up to 50 at a time

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled executions: ${fetchError.message}`);
    }

    if (!pendingExecs || pendingExecs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending executions', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    console.log(`[SCHEDULED] Processing ${pendingExecs.length} pending execution(s)`);

    let processed = 0;
    let errors = 0;

    for (const exec of pendingExecs) {
      try {
        // Mark as executing
        await supabase
          .from('automation_scheduled_executions')
          .update({ status: 'executing' })
          .eq('id', exec.id);

        // Resume execution
        const result = await resumeFromDelay(supabase, exec);
        const executedAt = new Date().toISOString();

        // Mark as completed
        await supabase
          .from('automation_scheduled_executions')
          .update({
            status: result.errors > 0 ? 'failed' : 'completed',
            executed_at: executedAt,
            execution_context: {
              ...(exec.execution_context || {}),
              resume_result: result,
              resumed_at: executedAt,
            },
          })
          .eq('id', exec.id);

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

        await supabase
          .from('automation_scheduled_executions')
          .update({
            status: 'failed',
            executed_at: executedAt,
            execution_context: {
              ...(exec.execution_context || {}),
              resume_error: err?.message || 'Unknown error',
              resumed_at: executedAt,
            },
          })
          .eq('id', exec.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processed} scheduled execution(s)`,
        stats: { total: pendingExecs.length, processed, errors },
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
