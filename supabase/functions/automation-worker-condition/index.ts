// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const config = body?.config || {};
    const context = body?.context || {};
    const text = String(context.comment_text || context.message_text || '').toLowerCase();

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
      case 'follower_count':
      case 'comment_count':
        // Placeholder until account metrics are wired into node context.
        conditionResult = true;
        break;
      default:
        conditionResult = false;
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
