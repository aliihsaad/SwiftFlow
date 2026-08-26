// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { interpolateTemplate } from "../_shared/automation-context.ts"
import { getMetaGraphApiBaseUrl, toMetaGraphFormBody } from "../_shared/meta-graph.ts"
import { assertInternalInvoke } from "../_shared/internal-auth.ts"
import { buildInstagramPrivateReplyPlan } from "../_shared/instagram-private-reply.ts"

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
    const accessToken = body?.access_token as string | undefined;
    const pageId = body?.page_id as string | undefined;
    const connectionMethod = body?.connection_method as string | undefined;
    const metaGraphUrl = getMetaGraphApiBaseUrl(connectionMethod);

    if (!accessToken || !pageId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing access_token or page_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!context.comment_id) {
      return new Response(JSON.stringify({ success: false, error: 'Private Reply requires comment context' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const useAiResponse = config.use_ai_response === true;
    const aiGeneratedMessage = String(context.ai_response || '').trim();
    const fallbackMessage = interpolateTemplate(String(config.message || ''), context).trim();
    const message = useAiResponse ? (aiGeneratedMessage || fallbackMessage) : fallbackMessage;

    if (!message) {
      return new Response(JSON.stringify({
        success: false,
        error: useAiResponse
          ? 'AI response is empty and no fallback private reply message is configured'
          : 'Private Reply message cannot be empty',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const replyPlan = buildInstagramPrivateReplyPlan(config, message);
    if (!replyPlan.ok) {
      return new Response(JSON.stringify({ success: false, error: replyPlan.error }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sendUrl = `${metaGraphUrl}/${pageId}/messages`;
    const sendReply = async (providerMessage: Record<string, unknown>) => {
      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: await toMetaGraphFormBody({
          recipient: { comment_id: context.comment_id },
          message: providerMessage,
          access_token: accessToken,
        }, accessToken, { connectionMethod }),
      });
      return { response, result: await response.json().catch(() => null) };
    };

    let delivery = await sendReply(replyPlan.message);
    let deliveryMode = replyPlan.interactive ? 'buttons' : 'text';

    if (
      replyPlan.interactive &&
      config.button_fallback_to_text !== false &&
      (!delivery.response.ok || !delivery.result || delivery.result?.error)
    ) {
      delivery = await sendReply({ text: replyPlan.fallbackText });
      deliveryMode = 'text_fallback';
    }

    const { response, result } = delivery;

    if (!response.ok || !result || result?.error) {
      return new Response(JSON.stringify({
        success: false,
        error: result?.error?.message || 'Private reply failed',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dmSent: true,
      output: {
        channel: 'private_reply',
        messageId: result.message_id,
        deliveryMode,
        interactive: replyPlan.interactive,
      },
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
