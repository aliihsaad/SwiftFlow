import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('Supabase configuration missing')
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)

        const { data: settings, error: settingsError } = await supabase
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        if (settingsError) {
            console.error('Settings error:', settingsError)
        }

        const dbKey = settings?.gemini_api_key
        const envKey = Deno.env.get('GEMINI_API_KEY')
        const apiKey = dbKey || envKey

        if (!apiKey) {
            throw new Error('Gemini API key not configured.')
        }

        // Fix for 404: Force gemini-pro if flash is requested or no model set
        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        // Prioritize Flash as Pro is deprecated on some channels
        if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
            modelName = 'gemini-2.0-flash'
        }

        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a Social Media Content Strategist. 
            
            Your goal is to generate 5 high-quality, engaging content ideas based on the user's input.
            
            RETURN JSON ONLY. The response must match this schema:
            {
              "type": "content_cards",
              "data": [
                {
                  "id": "unique_string",
                  "title": "Catchy Hook or Title",
                  "body": "The main caption or content summary...",
                  "platform": "instagram" | "facebook" | "linkedin" | "twitter"
                }
              ]
            }

            Guidelines:
            1. Title should be punchy and scroll-stopping.
            2. Body should be actionable.
            3. Provide exactly 5 ideas.`,
            generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json"
            }
        })

        const history = messages.slice(0, -1)
            .filter((m: Message, index: number) => !(index === 0 && m.role === 'assistant'))
            .map((m: Message) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }]
            }))

        const chatSession = model.startChat({ history })
        const result = await chatSession.sendMessage(lastMsg.content)
        const responseText = result.response.text()
        console.log('Raw AI Response:', responseText)

        let parsedResult
        try {
            // Clean markdown backticks if present
            const cleanText = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
            const jsonStart = cleanText.indexOf('{')
            const jsonEnd = cleanText.lastIndexOf('}')

            if (jsonStart !== -1 && jsonEnd !== -1) {
                parsedResult = JSON.parse(cleanText.substring(jsonStart, jsonEnd + 1))
            } else {
                parsedResult = JSON.parse(cleanText)
            }
        } catch (e) {
            // Fallback if model failed to produce valid JSON
            parsedResult = { type: "text", message: responseText }
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Generate Ideas Error:', error)
        // Return 200 to pass the error message to the client
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
