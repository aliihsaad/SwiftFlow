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
        const lastMsg = messages[messages.length - 1].content

        // 1. Extract URL (Naive regex)
        const urlMatch = lastMsg.match(/(https?:\/\/[^\s]+)/)
        let linkContent = ""

        if (urlMatch) {
            try {
                const res = await fetch(urlMatch[0])
                const html = await res.text()
                // Naive HTML strip
                const text = html.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, "")
                    .replace(/<style[^>]*>([\S\s]*?)<\/style>/gmi, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                linkContent = text.substring(0, 10000) // Limit context
            } catch (e) {
                console.error("Failed to fetch link", e)
                linkContent = "(Could not fetch link content automatically. Please just use the URL context if known.)"
            }
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data: settings } = await supabase.from('workspace_settings').select('*').eq('workspace_id', workspaceId).maybeSingle()
        const apiKey = settings?.gemini_api_key || Deno.env.get('GEMINI_API_KEY')

        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
            modelName = 'gemini-2.0-flash'
        }

        const genAI = new GoogleGenerativeAI(apiKey!)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a Content Repurposing Expert. You take source material (URLs, articles) and transform it into engaging social media posts.
            
            Context Provided: ${linkContent ? "I have fetched the content of the link for you." : "No link content fetched."}
            
            Guidelines:
            1. Summarize the key value proposition.
            2. Write a LinkedIn/Twitter post in a "Thought Leader" style.
            3. Use bullet points for readability.`,
        })

        const prompt = linkContent
            ? `Source Text: ${linkContent}\n\nUser Request: ${lastMsg}`
            : lastMsg

        const result = await model.generateContent(prompt)
        const responseText = result.response.text()

        return new Response(JSON.stringify({ response: responseText }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
