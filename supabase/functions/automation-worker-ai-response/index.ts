import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildAutomationAiPrompt } from "../_shared/automation-context.ts"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function isTransientAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /503|Service Unavailable|high demand|rate limit|too many requests|temporar/i.test(message);
}

function buildTransientFallback(context: Record<string, unknown>): string {
  const username = String(context.commenter_username || '').trim();
  return username ? `Thanks for your comment, ${username}!` : 'Thanks for your comment!';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: any = {};

  try {
    body = await req.json();
    const config = body?.config || {};
    const context = body?.context || {};
    const workspaceId = body?.workspace_id as string | undefined;

    if (!workspaceId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing workspace_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = buildAutomationAiPrompt(config, context);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const useGlobal = config.use_global_settings !== false;
    const aiConfig = await resolveAIConfig({
      supabase,
      workspaceId,
      modelOverride: config.model,
      maxTokensOverride: config.max_tokens,
      useGlobalSettings: useGlobal,
    });

    const responseText = requireGeneratedText(await generateText({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      modelName: aiConfig.modelName,
      prompt,
      temperature: aiConfig.temperature,
      maxTokens: aiConfig.maxTokens,
    }))

    const provider = aiConfig.provider;
    const modelName = aiConfig.modelName;

    const includeCta = config.include_cta === true;
    const ctaMode = config.cta_mode === 'text' ? 'text' : 'button';
    const ctaButtonText = String(config.cta_button_text || '').trim();
    const ctaLinkUrl = String(config.cta_link_url || '').trim();
    const ctaLinkMessage = String(config.cta_link_message || '').trim();

    return new Response(JSON.stringify({
      success: true,
      output: {
        response: responseText,
        provider,
        model: modelName,
        cta_mode: includeCta ? ctaMode : undefined,
        cta_button_text: includeCta ? ctaButtonText : undefined,
        cta_link_url: includeCta ? ctaLinkUrl : undefined,
        cta_link_message: includeCta ? ctaLinkMessage : undefined,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const context = body?.context || {};
    const config = body?.config || {};
    if (String(config?.preset_goal || '') === 'reply_comment' && isTransientAiError(err)) {
      return new Response(JSON.stringify({
        success: true,
        output: {
          response: buildTransientFallback(context),
          provider: 'fallback',
          model: 'transient-ai-fallback',
          fallback_reason: toUserFriendlyError(err),
        },
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: false, error: toUserFriendlyError(err) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
