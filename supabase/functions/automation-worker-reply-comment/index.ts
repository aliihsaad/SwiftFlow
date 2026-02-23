// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { META_GRAPH_URL, interpolateTemplate } from "../_shared/automation-context.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeCommentReply(text: string, maxLength = 220): string {
  const normalized = String(text || '').replace(/\r/g, '').trim();
  if (!normalized) return '';

  if (normalized.length <= maxLength && !normalized.includes('\n')) {
    return normalized;
  }

  // If the model returns multiple options in quotes, pick the first option.
  const quotedMatches = [...normalized.matchAll(/"([^"\n]{3,220})"/g)]
    .map((m) => String(m[1] || '').trim())
    .filter(Boolean);
  if (quotedMatches.length > 0) {
    return quotedMatches[0].slice(0, maxLength).trim();
  }

  const candidates = normalized
    .split('\n')
    .map((line) => line.replace(/^[-*#>\d.)\s]+/, '').trim())
    .filter(Boolean)
    .filter((line) => !/^okay[,!]? here are/i.test(line))
    .filter((line) => !/^general\/neutral/i.test(line))
    .filter((line) => !/^if you'?re /i.test(line))
    .filter((line) => !/^to help me /i.test(line))
    .filter((line) => !/:$/.test(line));

  const first = candidates.find((line) => line.length <= maxLength) || candidates[0] || normalized;
  return first.slice(0, maxLength).trim();
}

function pickFallbackMessage(messages: unknown[], context: Record<string, unknown>): string {
  const usable = (Array.isArray(messages) ? messages : [])
    .map((m) => interpolateTemplate(String(m || ''), context as any).trim())
    .filter(Boolean);
  if (!usable.length) return '';
  return usable[Math.floor(Math.random() * usable.length)] || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const config = body?.config || {};
    const context = body?.context || {};
    const accessToken = body?.access_token as string | undefined;
    const platform = String(body?.platform || '').toLowerCase();

    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: 'Missing access_token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!context.comment_id) {
      return new Response(JSON.stringify({ success: false, error: 'No comment_id in trigger context' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const useAiResponse = config.use_ai_response === true;
    const aiGeneratedMessage = String(context.ai_response || '').trim();
    const fallbackMessage = pickFallbackMessage(config.messages as unknown[], context);

    let message = useAiResponse ? (aiGeneratedMessage || fallbackMessage) : fallbackMessage;
    if (!message) {
      return new Response(JSON.stringify({
        success: false,
        error: useAiResponse
          ? 'AI response is empty and no fallback reply message is configured'
          : 'No reply messages configured',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    message = normalizeCommentReply(message);
    if (!message) {
      return new Response(JSON.stringify({ success: false, error: 'Reply message is empty after templating' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const replyPath = platform === 'facebook' ? 'comments' : 'replies';
    const url = `${META_GRAPH_URL}/${context.comment_id}/${replyPath}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: accessToken }),
    });
    const result = await response.json();

    if (!response.ok || result?.error) {
      return new Response(JSON.stringify({
        success: false,
        error: result?.error?.message || 'Reply failed',
        output: { platform, replyPath, meta_error: result?.error || null },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      output: { replyId: result.id },
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
