// @ts-nocheck - Deno runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildAutomationAiPrompt } from "../_shared/automation-context.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeModel(provider: string, modelName?: string): string {
  const model = String(modelName || '').trim();
  if (!model) {
    return provider === 'openai' ? 'gpt-4o-mini' : 'gemini-1.5-flash';
  }

  if (provider === 'openai' && model.startsWith('gemini')) return 'gpt-4o-mini';
  if (provider === 'gemini' && model.startsWith('gpt-')) return 'gemini-1.5-flash';
  return model;
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

    const { data: settings } = await supabase
      .from('workspace_settings')
      .select('ai_provider, gemini_api_key, openai_api_key, ai_model_name, ai_temperature, ai_max_tokens')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const useGlobal = config.use_global_settings !== false;
    const provider = String((useGlobal ? settings?.ai_provider : (config.provider || settings?.ai_provider)) || 'gemini');
    const modelName = normalizeModel(provider, useGlobal ? settings?.ai_model_name : (config.model || settings?.ai_model_name));
    const temperature = Number(settings?.ai_temperature ?? 0.7);
    const maxTokens = Number(config.max_tokens || settings?.ai_max_tokens || 500);

    let responseText = '';

    if (provider === 'openai') {
      const openaiKey = settings?.openai_api_key || Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        return new Response(JSON.stringify({
          success: false,
          error: 'OpenAI API key not configured. Add it in Settings > AI Provider.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      responseText = await generateWithOpenAI(openaiKey, modelName, prompt, temperature, maxTokens);
    } else {
      const geminiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Gemini API key not configured. Add it in Settings > AI Provider.',
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      responseText = await generateWithGemini(geminiKey, modelName, prompt, temperature, maxTokens);
    }

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
    return new Response(JSON.stringify({ success: false, error: err?.message || 'AI generation failed' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
