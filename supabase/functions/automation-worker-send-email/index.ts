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

    // Placeholder worker to keep node responsibilities isolated.
    // Wire to Resend/Sendgrid/etc. in a follow-up phase.
    console.log('[WORKER_SEND_EMAIL] Placeholder execution', {
      subject: config?.subject,
      recipient_type: config?.recipient_type,
    });

    return new Response(JSON.stringify({
      success: true,
      output: { placeholder: true },
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
