// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { executeWorkflowGraph } from "../process-automations/graph-executor.ts"
import {
  getAutomationFailureAlertRecipients,
  sendResendEmail,
  textToSimpleHtml,
} from "../_shared/resend-email.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function summarizeFailedNodes(
  nodeResults: Record<string, { success: boolean; output?: any; error?: string }> | undefined,
  maxItems = 10,
) {
  return Object.entries(nodeResults || {})
    .filter(([, nodeResult]) => nodeResult?.success === false)
    .slice(0, maxItems)
    .map(([nodeId, nodeResult]) => ({
      nodeId,
      error: String(nodeResult?.error || 'Node failed'),
    }));
}

async function sendAutomationFailureAlert(params: {
  automation: any
  workspaceId: string
  runId: string
  eventId?: string
  triggerType?: string
  graphResult: {
    processed?: number
    dmsSent?: number
    errors?: number
    nodeResults?: Record<string, { success: boolean; output?: any; error?: string }>
  }
}) {
  const recipients = getAutomationFailureAlertRecipients()
  if (!recipients.length) return

  const failedNodes = summarizeFailedNodes(params.graphResult.nodeResults)
  const subject = `[SwiftFlow] Automation failure alert: ${params.automation?.name || params.automation?.id || 'Unknown automation'}`

  const lines = [
    'SwiftFlow automation run reported one or more node failures.',
    '',
    `Automation: ${params.automation?.name || 'Unknown'} (${params.automation?.id || 'n/a'})`,
    `Workspace ID: ${params.workspaceId}`,
    `Run ID: ${params.runId}`,
    params.eventId ? `Event ID: ${params.eventId}` : null,
    params.triggerType ? `Trigger: ${params.triggerType}` : null,
    `Error count: ${Number(params.graphResult.errors || 0)}`,
    `Processed nodes: ${Number(params.graphResult.processed || 0)}`,
    `DMs sent: ${Number(params.graphResult.dmsSent || 0)}`,
    '',
    failedNodes.length ? 'Failed nodes:' : 'Failed nodes: none listed',
    ...failedNodes.map((item) => `- ${item.nodeId}: ${item.error}`),
  ].filter(Boolean).join('\n')

  await sendResendEmail({
    to: recipients,
    subject,
    text: lines,
    html: textToSimpleHtml(lines),
  })
}

async function upsertNodeRuns(
  supabase: any,
  workspaceId: string,
  automation: any,
  runId: string,
  triggerContext: Record<string, unknown>,
  nodeResults: Record<string, { success: boolean; output?: any; error?: string }>,
) {
  const nodes = automation?.workflow_graph?.nodes || [];
  const byId = new Map(nodes.map((n: any) => [n.id, n]));

  const rows = Object.entries(nodeResults || {}).map(([nodeId, nodeResult]) => {
    const node = byId.get(nodeId);
    return {
      workspace_id: workspaceId,
      automation_id: automation.id,
      run_id: runId,
      node_id: nodeId,
      node_type: node?.data?.type || 'unknown',
      status: nodeResult.success ? 'completed' : 'failed',
      input: {
        config: node?.data?.config || {},
        trigger_context: triggerContext || {},
      },
      output: nodeResult.output || {},
      error_message: nodeResult.error || null,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  if (!rows.length) return;

  const { error } = await supabase
    .from('automation_node_runs')
    .upsert(rows, { onConflict: 'run_id,node_id' });

  if (error) {
    console.error('[RUN_WORKER] Failed to write automation_node_runs:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const runId = body?.run_id as string | undefined;
    const automationId = body?.automation_id as string | undefined;
    const workspaceId = body?.workspace_id as string | undefined;
    const eventId = body?.event_id as string | undefined;
    const triggerType = body?.trigger_type as string | undefined;
    const triggerContext = (body?.trigger_context || {}) as Record<string, unknown>;

    if (!automationId || !workspaceId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing automation_id or workspace_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let effectiveRunId = runId;
    if (!effectiveRunId) {
      const { data: createdRun, error: createRunError } = await supabase
        .from('automation_runs')
        .insert({
          workspace_id: workspaceId,
          automation_id: automationId,
          event_id: eventId || null,
          status: 'queued',
          trigger_type: triggerType || null,
          trigger_context: triggerContext,
        })
        .select('id')
        .single();
      if (createRunError || !createdRun) {
        throw new Error(`Failed to create automation run: ${createRunError?.message || 'unknown'}`);
      }
      effectiveRunId = createdRun.id;
    }

    await supabase
      .from('automation_runs')
      .update({
        status: 'running',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveRunId);

    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select(`
        *,
        social_accounts (
          id,
          account_id,
          access_token,
          platform,
          metadata
        )
      `)
      .eq('id', automationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (automationError || !automation) {
      throw new Error(`Automation not found: ${automationError?.message || automationId}`);
    }

    if (!automation.is_active) {
      await supabase
        .from('automation_runs')
        .update({
          status: 'skipped',
          error_message: 'Automation is inactive',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', effectiveRunId);

      return new Response(JSON.stringify({
        success: true,
        run_id: effectiveRunId,
        status: 'skipped',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const account = automation.social_accounts;
    if (!account?.access_token) {
      throw new Error('Missing social account access token for automation');
    }

    const graphResult = await executeWorkflowGraph(supabase, automation, triggerContext, account);
    await upsertNodeRuns(supabase, workspaceId, automation, effectiveRunId, triggerContext, graphResult.nodeResults || {});

    const runStatus = graphResult.errors > 0 ? 'failed' : 'completed';
    await supabase
      .from('automation_runs')
      .update({
        status: runStatus,
        node_results: graphResult.nodeResults || {},
        processed_count: graphResult.processed || 0,
        dms_sent_count: graphResult.dmsSent || 0,
        error_count: graphResult.errors || 0,
        error_message: graphResult.errors > 0 ? 'One or more nodes failed' : null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', effectiveRunId);

    if (eventId) {
      await supabase
        .from('automation_events')
        .update({
          status: runStatus === 'completed' ? 'processed' : 'failed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    }

    if (graphResult.processed > 0 || graphResult.dmsSent > 0) {
      const { data: current } = await supabase
        .from('automations')
        .select('total_triggered, total_dms_sent')
        .eq('id', automation.id)
        .single();

      if (current) {
        await supabase
          .from('automations')
          .update({
            total_triggered: (current.total_triggered || 0) + graphResult.processed,
            total_dms_sent: (current.total_dms_sent || 0) + graphResult.dmsSent,
            updated_at: new Date().toISOString(),
          })
          .eq('id', automation.id);
      }
    }

    if (graphResult.errors > 0 && effectiveRunId) {
      try {
        await sendAutomationFailureAlert({
          automation,
          workspaceId,
          runId: effectiveRunId,
          eventId,
          triggerType,
          graphResult,
        })
      } catch (alertError) {
        console.error('[RUN_WORKER] Failed to send automation failure alert email:', alertError)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      run_id: effectiveRunId,
      status: runStatus,
      result: graphResult,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[RUN_WORKER] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Run worker failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
