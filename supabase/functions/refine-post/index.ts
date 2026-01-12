import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { messages, workspaceId, originalContent, refinementInstruction, platform } = await req.json()

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        const { data: settings } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()

        const apiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')!
        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
            modelName = 'gemini-2.0-flash'
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a Social Media Content Editor.
            
            Your goal is to REWRITE or REFINE the provided content based on the user's instruction.
            
            RETURN JSON ONLY:
            {
               "refinedContent": "The updated text...",
               "changes_made": "Brief explanation of what changed"
            }
            
            Guidelines:
            1. Maintain the core message but adjust tone/style/length as requested.
            2. If 'platform' is provided, optimize for that platform (hashtags, length).`,
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        })

        const prompt = `
        Original Content: "${originalContent}"
        Target Platform: ${platform || 'General'}
        User Instruction: ${refinementInstruction || 'Improve this post.'}
        `

        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        let parsedResult
        try {
            parsedResult = JSON.parse(responseText)
        } catch (e) {
            parsedResult = { refinedContent: responseText, changes_made: "Auto-formatted" }
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
