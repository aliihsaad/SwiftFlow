// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { keywordMatch } from "../_shared/automation-context.ts"
import { redactSensitiveLogValue } from "../_shared/log-redaction.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TEMP_DISABLED_TRIGGER_TYPES = new Set([
  'trigger_story_mention',
]);

function deriveEventType(triggerType: string | null, webhookContext: Record<string, any>): string {
  if (triggerType === 'trigger_new_message') return 'message';
  if (triggerType === 'trigger_story_mention') return 'story_mention';
  if (triggerType === 'trigger_story_reply') return 'story_reply';
  if (triggerType === 'trigger_new_follower') return 'follower';
  if (triggerType === 'trigger_new_comment') return 'comment';

  if (webhookContext?.comment_id) return 'comment';
  if (webhookContext?.message_id || webhookContext?.message_text) return 'message';
  if (webhookContext?.follower_id) return 'follower';
  return 'unknown';
}

function buildEventKey(eventType: string, ctx: Record<string, any>): string {
  if (eventType === 'comment' && ctx.comment_id) return `comment:${ctx.comment_id}`;
  if (eventType === 'message' && ctx.message_id) return `message:${ctx.message_id}`;
  if (eventType === 'story_mention' && ctx.sender_id && ctx.timestamp) return `story_mention:${ctx.sender_id}:${ctx.timestamp}`;
  if (eventType === 'story_reply' && ctx.sender_id && ctx.timestamp) return `story_reply:${ctx.sender_id}:${ctx.timestamp}`;
  if (eventType === 'follower' && ctx.follower_id && ctx.timestamp) return `follower:${ctx.follower_id}:${ctx.timestamp}`;
  return `${eventType}:${crypto.randomUUID()}`;
}

function getTriggerNode(automation: any) {
  return automation?.workflow_graph?.nodes?.find((node: any) => String(node?.data?.type || '').startsWith('trigger_'));
}

function matchesAutomationTrigger(
  automation: any,
  eventType: string,
  triggerTypeHint: string | null,
  webhookContext: Record<string, any>,
  sourceSocialAccountId: string | null,
): boolean {
  const triggerNode = getTriggerNode(automation);
  if (!triggerNode) return false;

  const triggerType = String(triggerNode?.data?.type || '');
  const config = triggerNode?.data?.config || {};

  if (TEMP_DISABLED_TRIGGER_TYPES.has(triggerType)) {
    return false;
  }

  if (sourceSocialAccountId && config.social_account_id && config.social_account_id !== sourceSocialAccountId) {
    return false;
  }

  if (triggerTypeHint && triggerTypeHint !== triggerType) {
    return false;
  }

  switch (triggerType) {
    case 'trigger_new_comment': {
      if (eventType !== 'comment') return false;
      if (config.post_id && webhookContext?.post_id && config.post_id !== webhookContext.post_id) {
        return false;
      }
      const mode = config.trigger_type === 'keywords' ? 'keywords' : 'any';
      return keywordMatch(String(webhookContext?.comment_text || ''), config.keywords || [], mode);
    }
    case 'trigger_new_message': {
      if (eventType !== 'message') return false;
      const mode = config.trigger_type === 'keywords' ? 'keywords' : 'any';
      return keywordMatch(String(webhookContext?.message_text || ''), config.keywords || [], mode);
    }
    case 'trigger_story_mention':
      return eventType === 'story_mention';
    case 'trigger_story_reply':
      return eventType === 'story_reply';
    case 'trigger_new_follower':
      return eventType === 'follower';
    default:
      return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const workspaceId = body?.workspace_id as string | undefined;
    const webhookContext = (body?.webhook_context || {}) as Record<string, any>;
    const source = String(body?.source || 'webhook');
    const triggerTypeHint = body?.trigger_type ? String(body.trigger_type) : null;
    const sourceSocialAccountId = body?.social_account_id ? String(body.social_account_id) : null;
    const targetAutomationId = body?.automation_id ? String(body.automation_id) : null;

    if (!workspaceId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing workspace_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventType = body?.event_type
      ? String(body.event_type)
      : deriveEventType(triggerTypeHint, webhookContext);

    if (eventType === 'unknown') {
      return new Response(JSON.stringify({ success: true, message: 'Ignored unknown event type', matched: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const eventKey = body?.event_key
      ? String(body.event_key)
      : buildEventKey(eventType, webhookContext);

    let eventId: string | null = null;
    const { data: insertedEvent, error: eventInsertError } = await supabase
      .from('automation_events')
      .insert({
        workspace_id: workspaceId,
        event_key: eventKey,
        event_type: eventType,
        source,
        payload: webhookContext,
        status: 'received',
      })
      .select('id')
      .single();

    if (eventInsertError) {
      if (eventInsertError.code === '23505') {
        const { data: existing } = await supabase
          .from('automation_events')
          .select('id, status')
          .eq('workspace_id', workspaceId)
          .eq('event_key', eventKey)
          .maybeSingle();
        eventId = existing?.id || null;

        if (existing?.status === 'processed' || existing?.status === 'queued') {
          return new Response(JSON.stringify({
            success: true,
            deduplicated: true,
            event_id: eventId,
            event_type: eventType,
            matched: 0,
            dispatched: 0,
            failed: 0,
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } else {
        throw new Error(`Failed to insert automation event: ${eventInsertError.message}`);
      }
    } else {
      eventId = insertedEvent?.id || null;
    }

    let query = supabase
      .from('automations')
      .select('id, workspace_id, social_account_id, is_active, editor_version, workflow_graph')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .eq('editor_version', 'canvas');

    if (targetAutomationId) {
      query = query.eq('id', targetAutomationId);
    }

    const { data: automations, error: automationsError } = await query;
    if (automationsError) {
      throw new Error(`Failed to fetch canvas automations: ${automationsError.message}`);
    }

    const matched = (automations || []).filter((automation: any) =>
      matchesAutomationTrigger(
        automation,
        eventType,
        triggerTypeHint,
        webhookContext,
        sourceSocialAccountId,
      )
    );

    if (eventId) {
      await supabase
        .from('automation_events')
        .update({ status: 'queued' })
        .eq('id', eventId);
    }

    let dispatched = 0;
    let failed = 0;

    for (const automation of matched) {
      const triggerNode = getTriggerNode(automation);
      const runPayload = {
        workspace_id: workspaceId,
        automation_id: automation.id,
        event_id: eventId,
        trigger_type: triggerNode?.data?.type || triggerTypeHint,
        trigger_context: webhookContext,
      };

      const { data: runRow, error: runInsertError } = await supabase
        .from('automation_runs')
        .insert({
          workspace_id: workspaceId,
          automation_id: automation.id,
          event_id: eventId,
          status: 'queued',
          trigger_type: triggerNode?.data?.type || triggerTypeHint,
          trigger_context: webhookContext,
        })
        .select('id')
        .single();

      if (runInsertError || !runRow) {
        console.error('[ORCHESTRATOR] Failed to create run row:', redactSensitiveLogValue(runInsertError));
        failed++;
        continue;
      }

      const invokeResult = await invokeEdgeFunction('automation-worker-run', {
        ...runPayload,
        run_id: runRow.id,
      });

      if (!invokeResult.ok || invokeResult.data?.success === false) {
        console.error('[ORCHESTRATOR] Run worker invocation failed', redactSensitiveLogValue({
          automation_id: automation.id,
          run_id: runRow.id,
          status: invokeResult.status,
          error: invokeResult.error,
          data: invokeResult.data,
        }));
        failed++;
        await supabase
          .from('automation_runs')
          .update({
            status: 'failed',
            error_message: invokeResult.error || invokeResult.data?.error || 'Run worker invocation failed',
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', runRow.id);
      } else {
        dispatched++;
      }
    }

    if (eventId) {
      await supabase
        .from('automation_events')
        .update({
          status: failed > 0 ? 'failed' : (matched.length > 0 ? 'processed' : 'ignored'),
          processed_at: new Date().toISOString(),
        })
        .eq('id', eventId);
    }

    return new Response(JSON.stringify({
      success: true,
      event_type: eventType,
      event_id: eventId,
      matched: matched.length,
      dispatched,
      failed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ORCHESTRATOR] Error:', redactSensitiveLogValue(error));
    return new Response(JSON.stringify({ success: false, error: error?.message || 'Orchestrator failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
