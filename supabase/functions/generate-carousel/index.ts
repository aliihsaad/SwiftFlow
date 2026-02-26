import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { GoogleGenerativeAI } from "npm:@google/generative-ai"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { decryptSecretIfNeeded } from "../_shared/secret-crypto.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, workspaceId } = await req.json()

        if (!messages || !Array.isArray(messages) || messages.length === 0) throw new Error('Messages required')
        const lastMsg = messages[messages.length - 1]

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

        const { data: settings } = await supabase
            .from('workspace_settings')
            .select('*')
            .eq('workspace_id', workspaceId)
            .maybeSingle()

        const apiKey = (await decryptSecretIfNeeded(settings?.gemini_api_key)) || Deno.env.get('GEMINI_API_KEY')
        if (!apiKey) throw new Error('API Key missing')

        let modelName = settings?.ai_model_name || 'gemini-2.0-flash'
        if (modelName === 'gemini-pro' || modelName === 'gemini-1.5-flash' || modelName === 'gemini-1.5-flash-latest') {
            modelName = 'gemini-2.0-flash'
        }
        const genAI = new GoogleGenerativeAI(apiKey)

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: `You are a Social Media Content Creator specializing in educational carousels.
            
            Your goal is to create a structured slide-by-slide breakdown for a carousel post.
            
            RETURN JSON ONLY. The response must match this schema:
            {
              "type": "carousel_slides",
              "style": "The visual style requested (e.g. Minimal, Cartoon, Realistic)",
              "caption": "The main Instagram caption for the ENTIRE post. Engaging, with hook, value, and CTA. Include hashtags here.",
              "data": [
                {
                  "slide_number": 1,
                  "title": "Slide Title",
                  "content": "Main text content...",
                  "image_prompt": "Detailed prompt for generating the slide image. MUST explicitly ask for the Title and Content to be visible text overlaid on the design."
                }
              ]
            }

            Guidelines:
            1. The 'caption' field is for the whole post, not individual slides.
            2. The 'image_prompt' MUST describe a design where the text is PART of the image.
               - Example: "A minimal infographic slide. In the center, large bold text reads: '5 Coding Tips'. Dark background with code syntax highlights."
            3. Slide 1 is always the Hook/Cover.
            4. Last slide is always a CTA.
            5. Keep text concise (under 20 words per slide for better visibility).`,
            generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        })

        const history = messages.slice(0, -1)
            .filter((m: Message, i: number) => !(i === 0 && m.role === 'assistant'))
            .map((m: Message) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }))

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
            parsedResult = { type: "text", message: responseText }
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('Generate Carousel Error:', error)
        return new Response(JSON.stringify({ error: error.message || 'Unknown error occurred' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
