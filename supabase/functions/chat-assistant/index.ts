import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decryptSecretIfNeeded } from "../_shared/secret-crypto.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeApiKey(value: unknown): string {
    return String(value || '').trim().replace(/^['"]|['"]$/g, '')
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, workspaceId } = await req.json()

        // Validate messages
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages array is required')
        }

        const lastMsg = messages[messages.length - 1]
        if (!lastMsg || lastMsg.role !== 'user') {
            throw new Error('Last message must be from user')
        }

        if (!workspaceId) {
            throw new Error('workspaceId is required')
        }

        // Create Supabase client (simplified - no RLS)
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        // Fetch workspace settings
        const { data: settings, error: settingsError } = await supabase
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        if (settingsError) {
            console.error('Settings error:', settingsError)
        }

        // Fetch brand profile for language
        const { data: brandProfile } = await supabase
            .from('workspace_brand_profiles')
            .select('language, brand_voice, business_name')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        // Language names mapping
        const LANGUAGE_NAMES: Record<string, string> = {
            en: 'English', es: 'Spanish', fr: 'French', de: 'German',
            it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ar: 'Arabic',
            zh: 'Chinese', ja: 'Japanese', ko: 'Korean', hi: 'Hindi',
            ru: 'Russian', tr: 'Turkish'
        }

        const language = brandProfile?.language || 'en'
        const languageName = LANGUAGE_NAMES[language] || 'English'

        // Debug logging
        console.log(`Processing for workspace: ${workspaceId}`)
        console.log(`Settings found: ${settings ? 'Yes' : 'No'}`)

        // Get API key from settings (fallback to env if not set in DB)
        const dbKey = await decryptSecretIfNeeded(settings?.gemini_api_key)
        const envKey = Deno.env.get('GEMINI_API_KEY')
        const apiKey = normalizeApiKey(dbKey || envKey)

        console.log(`API Key Source: ${dbKey ? 'DB' : (envKey ? 'Env' : 'None')}`)

        if (!apiKey) {
            console.error('Missing API Key. DB:', !!dbKey, 'Env:', !!envKey)
            throw new Error('Gemini API key not configured. Please add it in Settings > AI Provider or set GEMINI_API_KEY secret.')
        }
        if (!apiKey.startsWith('AIza')) {
            throw new Error('Gemini API key format looks invalid. Please paste a valid Google AI Studio key.')
        }

        // Fix for 404: Force gemini-pro if flash is requested or no model set
        // Fix for 404: Force gemini-pro if flash is requested or no model set
        // Debugging: Aggressively force gemini-2.0-flash and log it
        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        if (!String(modelName).startsWith('gemini')) {
            modelName = 'gemini-2.0-flash'
        }

        // if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
        //    modelName = 'gemini-2.0-flash'
        // }

        console.log('FINAL MODEL NAME:', modelName)

        const temperature = settings?.ai_temperature || 0.7
        const maxTokens = settings?.ai_max_tokens || 2048

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are an expert Social Media Manager AI Assistant. Your role is to help users create engaging content, plan schedules, and analyze social media strategies for platforms like Instagram, Facebook, LinkedIn, and Twitter.

IMPORTANT: Respond in ${languageName} language. All your responses, captions, and content suggestions must be in ${languageName}.

Guidelines:
1. Be concise, professional, and creative.
2. When asked for captions, provide multiple variations (e.g., Short, Funny, Professional) - all in ${languageName}.
3. Suggest relevant hashtags.
4. If asked about technical issues, guide them to the Settings page.
5. Do not just list generic capabilities; actively help them with their specific request.
6. Use emoji where appropriate to match the social media vibe.
7. ALL content must be in ${languageName}.`,
            generationConfig: {
                temperature: temperature,
                maxOutputTokens: maxTokens,
            }
        })

        // Convert messages to Gemini format
        // Google Gemini requires the first message in history to be from 'user'.
        // If our local state starts with an 'assistant' greeting, we must filter it out.
        const history = messages.slice(0, -1)
            .filter((m: Message, index: number) => !(index === 0 && m.role === 'assistant'))
            .map((m: Message) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))

        const chatSession = model.startChat({ history })
        const result = await chatSession.sendMessage(lastMsg.content)
        const responseText = result.response.text()

        return new Response(JSON.stringify({ response: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Chat Assistant Error:', error)
        const message = String(error?.message || 'Failed to process chat')
        const userMessage = /API_KEY_INVALID|invalid api key|api key not valid/i.test(message)
            ? 'Gemini API key is invalid. Update it in Settings > AI Provider.'
            : message
        return new Response(JSON.stringify({ error: userMessage }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
