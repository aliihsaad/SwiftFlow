// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildAutomationAiPrompt } from "../_shared/automation-context.ts"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function generateWithGemini(apiKey: string, modelName: string, prompt: string, temperature: number, maxTokens: number) {
  const { GoogleGenerativeAI } = await import("npm:@google/generative-ai");
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function generateWithOpenAI(apiKey: string, modelName: string, prompt: string, temperature: number, maxTokens: number) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });
  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
  }

  return data?.choices?.[0]?.message?.content || '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
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

    let responseText = '';

    if (aiConfig.provider === 'openai') {
      responseText = await generateWithOpenAI(aiConfig.apiKey, aiConfig.modelName, prompt, aiConfig.temperature, aiConfig.maxTokens);
    } else {
      responseText = await generateWithGemini(aiConfig.apiKey, aiConfig.modelName, prompt, aiConfig.temperature, aiConfig.maxTokens);
    }

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
    return new Response(JSON.stringify({ success: false, error: toUserFriendlyError(err) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
