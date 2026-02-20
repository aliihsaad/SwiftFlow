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

    const method = String(config.method || 'GET').toUpperCase();
    const headers = { ...(config.headers || {}) };
    const options: RequestInit = { method, headers };

    if (config.body && method !== 'GET') {
      options.body = String(config.body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(String(config.url || ''), options);
    const responseText = await response.text();

    return new Response(JSON.stringify({
      success: response.ok,
      output: {
        status: response.status,
        body: responseText.substring(0, 1000),
      },
      error: response.ok ? undefined : `HTTP ${response.status}`,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err?.message || 'HTTP request failed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
