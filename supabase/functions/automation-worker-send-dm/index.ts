// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { META_GRAPH_URL, getRecipientId, interpolateTemplate } from "../_shared/automation-context.ts"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const DM_FALLBACK_CODES = new Set([
  '551',
  '551:1545041',
  '200:1545041',
  '10:2018108',
  '10:2534022',
  '10:2018278',
]);

function isDmFallbackError(error: { code?: number; error_subcode?: number }) {
  const key1 = String(error.code);
  const key2 = `${error.code}:${error.error_subcode}`;
  return DM_FALLBACK_CODES.has(key1) || DM_FALLBACK_CODES.has(key2);
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
    const pageId = body?.page_id as string | undefined;

    if (!accessToken || !pageId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing access_token or page_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const recipientId = getRecipientId(context);
    if (!recipientId) {
      return new Response(JSON.stringify({ success: false, error: 'No recipient ID in trigger context' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const useAiResponse = config.use_ai_response === true;
    const aiGeneratedMessage = String(context.ai_response || '').trim();
    const fallbackOpeningMessage = interpolateTemplate(String(config.opening_message || ''), context).trim();
    const openingMessage = useAiResponse
      ? (aiGeneratedMessage || fallbackOpeningMessage)
      : fallbackOpeningMessage;
    const useAiCta = config.use_ai_cta === true;
    const fallbackCtaMode = config.cta_mode === 'text' ? 'text' : 'button';
    const effectiveCtaMode = useAiCta
      ? (
        context.ai_cta_mode === 'text'
          ? 'text'
          : (context.ai_cta_mode === 'button' ? 'button' : fallbackCtaMode)
      )
      : fallbackCtaMode;
    const effectiveLinkUrl = useAiCta
      ? (String(context.ai_cta_link_url || '').trim() || String(config.link_url || '').trim())
      : String(config.link_url || '').trim();
    const effectiveButtonText = useAiCta
      ? (String(context.ai_cta_button_text || '').trim() || String(config.button_text || '').trim() || 'Open Link')
      : (String(config.button_text || '').trim() || 'Open Link');
    const effectiveLinkMessage = useAiCta
      ? (String(context.ai_cta_link_message || '').trim() || String(config.link_message || '').trim())
      : String(config.link_message || '').trim();
    const buttonFallbackToText = config.cta_button_fallback_to_text !== false;

    if (!openingMessage) {
      return new Response(JSON.stringify({
        success: false,
        error: useAiResponse
          ? 'AI response is empty and no fallback opening message is configured'
          : 'Send DM requires a non-empty opening message',
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const sendUrl = `${META_GRAPH_URL}/${pageId}/messages`;
    const dmResponse = await fetch(sendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: openingMessage },
        access_token: accessToken,
      }),
    });
    const dmResult = await dmResponse.json();

    if (!dmResponse.ok || dmResult?.error) {
      const dmError = dmResult?.error || {};
      const dmErrorMessage = dmError.message || 'DM failed';
      const fallbackEnabled = config.fallback_to_private_reply_on_failure === true;

      if (!fallbackEnabled) {
        return new Response(JSON.stringify({ success: false, error: dmErrorMessage }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!isDmFallbackError(dmError)) {
        return new Response(JSON.stringify({ success: false, error: dmErrorMessage }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const fallbackMessage = interpolateTemplate(String(config.fallback_message || ''), context).trim();
      const defaultFallback = effectiveLinkUrl
        ? `${openingMessage}\n\n${effectiveLinkUrl}`
        : openingMessage;

      const fallbackInvoke = await invokeEdgeFunction('automation-worker-private-reply', {
        config: { message: fallbackMessage || defaultFallback },
        context,
        access_token: accessToken,
        page_id: pageId,
      });

      if (!fallbackInvoke.ok || !fallbackInvoke.data?.success) {
        return new Response(JSON.stringify({
          success: false,
          error: fallbackInvoke.error || fallbackInvoke.data?.error || 'DM fallback failed',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(fallbackInvoke.data), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // DM succeeded; optional CTA follow-up
    if (effectiveLinkUrl) {
      const linkMessage = effectiveLinkMessage
        ? `${effectiveLinkMessage}\n\n${effectiveLinkUrl}`
        : effectiveLinkUrl;

      if (effectiveCtaMode === 'text') {
        await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: linkMessage },
            access_token: accessToken,
          }),
        });
      } else {
        const templateResponse = await fetch(sendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: {
              attachment: {
                type: 'template',
                payload: {
                  template_type: 'button',
                  text: effectiveLinkMessage || "Here's your link!",
                  buttons: [{ type: 'web_url', url: effectiveLinkUrl, title: effectiveButtonText }],
                },
              },
            },
            access_token: accessToken,
          }),
        });
        const templateResult = await templateResponse.json();

        if ((!templateResponse.ok || templateResult?.error) && buttonFallbackToText) {
          await fetch(sendUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipient: { id: recipientId },
              message: { text: linkMessage },
              access_token: accessToken,
            }),
          });
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      dmSent: true,
      output: { channel: 'dm', messageId: dmResult.message_id },
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
