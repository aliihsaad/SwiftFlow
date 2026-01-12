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
        const { messages, workspaceId } = await req.json()
        const lastMsg = messages[messages.length - 1]

        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

        // Fetch analytics
        const { data: analytics } = await supabase
            .from('analytics_snapshots')
            .select('*')
            .eq('workspace_id', workspaceId)
            .order('created_at', { ascending: false })
            .limit(30) // Last 30 snapshots

        const { data: settings } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()

        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
            modelName = 'gemini-2.0-flash'
        }

        const genAI = new GoogleGenerativeAI(settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')!)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a Social Media Analyst. I will provide you with raw analytics data.
            
            Guidelines:
            1. Summarize the key trends (Growth, Engagement, Reach).
            2. Compare performance across platforms if data exists.
            3. Provide one actionable recommendation based on the data.`,
        })

        const context = `Analytics Data (Last 30 snapshots): ${JSON.stringify(analytics, null, 2)}`
        const prompt = `${context}\n\nUser Question: ${lastMsg.content}`

        const result = await model.generateContent(prompt)
        return new Response(JSON.stringify({ response: result.response.text() }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, // Return 200 to expose message
        })
    }
})
