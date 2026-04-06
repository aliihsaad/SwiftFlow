import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { invokeEdgeFunction } from "../_shared/edge-invoke.ts"
import { resolveAIConfig, toUserFriendlyError } from "../_shared/ai-config.ts"
import { generateText, requireGeneratedText } from "../_shared/generate-text.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Message {
    role: 'user' | 'assistant'
    content: string
}

function serializeConversationHistory(messages: Message[]): string {
    const lines = messages
        .filter((m, index) => !(index === 0 && m.role === 'assistant'))
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)

    return lines.length ? lines.join('\n') : 'No prior conversation.'
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { messages, workspaceId, research, researchQuery } = await req.json()

        if (!messages || !Array.isArray(messages) || messages.length === 0) throw new Error('Messages required')
        const lastMsg = messages[messages.length - 1]

        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

        // Resolve AI config via shared helper
        const aiConfig = await resolveAIConfig({ supabase, workspaceId })
        // --- Research Phase (optional) ---
        let researchContext = ''
        if (research) {
            console.log('Research mode enabled for carousel, calling research-topic...')
            const researchResult = await invokeEdgeFunction('research-topic', {
                query: researchQuery || lastMsg.content,
                workspaceId,
            })

            if (researchResult.ok && researchResult.data?.research) {
                researchContext = `\nRESEARCH FINDINGS (from real-time Google Search):\n${researchResult.data.research}\n\nUse these research findings to create factually accurate, trend-aware slide content.\n`
                console.log('Research completed for carousel, findings length:', researchResult.data.research.length)
            } else {
                console.warn('Research failed or returned empty:', researchResult.error)
            }
        }

        const systemInstruction = `You are a Social Media Content Creator specializing in educational carousels.
            ${researchContext}
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
            5. Keep text concise (under 20 words per slide for better visibility).
            ${research ? '6. IMPORTANT: Base slide content on the RESEARCH FINDINGS above. Include real facts, stats, and current trends.' : ''}`

        const prompt = `CONVERSATION HISTORY:
${serializeConversationHistory(messages.slice(0, -1))}

LATEST USER REQUEST:
${lastMsg.content}

Return valid JSON only.`

        const responseText = requireGeneratedText(await generateText({
            provider: aiConfig.provider,
            apiKey: aiConfig.apiKey,
            modelName: aiConfig.modelName,
            prompt,
            systemInstruction,
            temperature: 0.7,
            maxTokens: Math.min(aiConfig.maxTokens, 2600),
        }), "Carousel response")
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
        } catch {
            parsedResult = { type: "text", message: responseText }
        }

        return new Response(JSON.stringify({ result: parsedResult }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: unknown) {
        console.error('Generate Carousel Error:', error)
        return new Response(JSON.stringify({ error: toUserFriendlyError(error) }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }
})
