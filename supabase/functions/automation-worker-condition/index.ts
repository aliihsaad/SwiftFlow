// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { getAutomationConditionPolicyIssue } from "../_shared/automation-condition-policy.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const unauthorized = await assertInternalInvoke(req, corsHeaders);
  if (unauthorized) return unauthorized;

  try {
    const body = await req.json();
    const config = body?.config || {};
    const context = body?.context || {};
    const text = String(context.comment_text || context.message_text || '').toLowerCase();
    const policyIssue = getAutomationConditionPolicyIssue(config.condition_type);
    if (policyIssue) {
      return new Response(JSON.stringify({
        success: false,
        error: policyIssue.message,
        output: { code: policyIssue.code },
      }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


    let conditionResult = false;
    switch (config.condition_type) {
      case 'keyword_match': {
        const keywords: string[] = Array.isArray(config.keywords) ? config.keywords : [];
        if (config.operator === 'contains') {
          conditionResult = keywords.some((k) => text.includes(String(k || '').toLowerCase()));
        } else if (config.operator === 'not_contains') {
          conditionResult = !keywords.some((k) => text.includes(String(k || '').toLowerCase()));
        } else if (config.operator === 'equals') {
          conditionResult = keywords.some((k) => text === String(k || '').toLowerCase());
        }
        break;
      }
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Unsupported automation condition.',
        }), {
          status: 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({
      success: true,
      output: { conditionResult },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
